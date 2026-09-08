import "server-only";
import { bucketBalances, policyFor, type BucketBalance, type PolicyRow } from "../buckets/index.ts";
import { getSql } from "../db.ts";
import { centsFromDb, type Cents } from "../money.ts";
import { shortAccountName } from "../names.ts";

export type { BucketBalance };

/**
 * The cash picture, in the owner's terms rather than the banks':
 *
 *   cash        every cash-role balance (checking and savings together)
 *   checking    the cash-role checking balances: what the cards and day-to-day pulls draw from
 *   savings     the cash-role savings balances: where paychecks land and the buckets are held
 *   owed        what is currently on the credit cards, already spent but not yet paid
 *   held        what the open buckets and goals park in savings
 *   unassigned  savings not claimed by any bucket: parked, but with no job yet
 *   free        checking minus what the cards will take: money that can go without touching savings
 */
export interface BucketOverview {
  buckets: BucketBalance[];
  held: Cents;
  cash: Cents;
  checking: Cents;
  savings: Cents;
  owed: Cents;
  unassigned: Cents;
  free: Cents;
  policy: { effectiveFrom: string; bufferPct: number; investPct: number; livingPct: number };
}

export async function bucketOverview(today: string): Promise<BucketOverview> {
  const sql = getSql();
  const [buckets, policy, rows] = await Promise.all([
    bucketBalances(sql),
    policyFor(sql, today),
    sql.query<{ checking: string; savings: string; owed: string }>(
      `select coalesce(sum(b.current_cents) filter (where a.role = 'cash' and a.subtype <> 'savings'), 0)::text as checking,
              coalesce(sum(b.current_cents) filter (where a.role = 'cash' and a.subtype = 'savings'), 0)::text as savings,
              coalesce(sum(b.current_cents) filter (where a.role = 'credit'), 0)::text as owed
         from account a
         left join lateral (select current_cents from balance_snapshot where account_id = a.id order by as_of desc, created_at desc limit 1) b on true
        where a.is_active and a.role in ('cash', 'credit')`,
    ),
  ]);
  const held = buckets.reduce((s, b) => s + b.held, 0n);
  const checking = centsFromDb(rows[0].checking);
  const savings = centsFromDb(rows[0].savings);
  const owed = centsFromDb(rows[0].owed);
  const unassigned = savings - held;
  return { buckets, held, cash: checking + savings, checking, savings, owed, unassigned, free: checking - owed, policy: toPolicy(policy) };
}

/** What this month's paychecks put into goals, so the living figure can show what is really left. */
export async function goalFundingThisMonth(month: string): Promise<Cents> {
  const [row] = await getSql().query<{ total: string }>(
    `select coalesce(sum(e.amount_cents), 0)::text as total
       from bucket_entry e join bucket b on b.id = e.bucket_id
      where b.kind = 'goal' and e.source = 'paycheck' and to_char(e.occurred_on, 'YYYY-MM') = $1`,
    [month],
  );
  return centsFromDb(row.total);
}

function toPolicy(p: PolicyRow) {
  const bufferPct = Number(p.buffer_pct);
  const investPct = Number(p.invest_pct);
  return { effectiveFrom: p.effective_from, bufferPct, investPct, livingPct: 100 - bufferPct - investPct };
}

export interface PaycheckView {
  txnId: string;
  postedAt: string;
  gross: Cents;
  buffer: Cents;
  invest: Cents;
  living: Cents;
}

export async function listPaychecks(limit = 100): Promise<PaycheckView[]> {
  const rows = await getSql().query<{ txn_id: string; posted_at: string; gross_cents: string; buffer_cents: string; invest_cents: string; living_cents: string }>(
    `select p.txn_id, t.posted_at::text, p.gross_cents::text, p.buffer_cents::text, p.invest_cents::text, p.living_cents::text
       from paycheck p join txn t on t.id = p.txn_id order by t.posted_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    txnId: r.txn_id, postedAt: r.posted_at, gross: centsFromDb(r.gross_cents),
    buffer: centsFromDb(r.buffer_cents), invest: centsFromDb(r.invest_cents), living: centsFromDb(r.living_cents),
  }));
}

export interface BucketEntryView {
  id: string;
  bucketId: string;
  amount: Cents;
  occurredOn: string;
  source: "paycheck" | "release" | "manual";
  note: string | null;
  description: string | null;
}

export async function listBucketEntries(limit = 60): Promise<BucketEntryView[]> {
  const rows = await getSql().query<{ id: string; bucket_id: string; amount_cents: string; occurred_on: string; source: BucketEntryView["source"]; note: string | null; description: string | null }>(
    `select e.id, e.bucket_id, e.amount_cents::text, e.occurred_on::text, e.source, e.note, t.description
       from bucket_entry e left join txn t on t.id = e.txn_id
      order by e.occurred_on desc, e.created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ id: r.id, bucketId: r.bucket_id, amount: centsFromDb(r.amount_cents), occurredOn: r.occurred_on, source: r.source, note: r.note, description: r.description }));
}

export interface BucketPoint {
  on: string;
  balance: Cents;
}

/** Each bucket's running balance after every entry, oldest first, for the history sparklines. */
export async function bucketHistory(): Promise<Record<string, BucketPoint[]>> {
  const rows = await getSql().query<{ bucket_id: string; on: string; balance: string }>(
    `select bucket_id, occurred_on::text as "on",
            sum(amount_cents) over (partition by bucket_id order by occurred_on, created_at rows unbounded preceding)::text as balance
       from bucket_entry order by bucket_id, occurred_on, created_at`,
  );
  const out: Record<string, BucketPoint[]> = {};
  for (const r of rows) (out[r.bucket_id] ??= []).push({ on: r.on, balance: centsFromDb(r.balance) });
  return out;
}

export interface HeldAccount {
  name: string;
  balance: Cents;
  asOf: string | null;
}

/** The savings account the buckets are held in: the cash-role savings account with the largest balance. */
export async function heldAccount(): Promise<HeldAccount | null> {
  const rows = await getSql().query<{ name: string; current_cents: string | null; as_of: string | null }>(
    `select a.name, b.current_cents::text, b.as_of::text
       from account a
       left join lateral (select current_cents, as_of from balance_snapshot where account_id = a.id order by as_of desc, created_at desc limit 1) b on true
      where a.is_active and a.role = 'cash' and a.subtype = 'savings'
      order by b.current_cents desc nulls last limit 1`,
  );
  const r = rows[0];
  return r ? { name: shortAccountName(r.name), balance: centsFromDb(r.current_cents ?? "0"), asOf: r.as_of } : null;
}
