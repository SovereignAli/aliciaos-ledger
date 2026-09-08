import { writeAudit } from "../audit.ts";
import type { Sql } from "../db.ts";
import { centsFromDb, type Cents } from "../money.ts";
import { splitPaycheck } from "./split.ts";

export { splitPaycheck } from "./split.ts";
export type { Split, SplitPolicy } from "./split.ts";

/**
 * Keeps the paycheck and bucket_entry tables in step with categorized
 * transactions. Called after categorization at ingest and after any manual
 * category change. Idempotent: the unique (bucket, txn) index makes a second
 * run a no-op.
 *
 *   payroll                → paycheck row + one funding entry per bucket
 *   investment/retirement  → release from 'investing' for the amount sent
 *   anything else          → remove any automatic rows this txn produced
 */

export interface PolicyRow {
  id: string;
  effective_from: string;
  buffer_pct: string;
  invest_pct: string;
}

export async function policyFor(sql: Sql, onDate: string): Promise<PolicyRow> {
  const [row] = await sql.query<PolicyRow>(
    `select id, effective_from::text, buffer_pct::text, invest_pct::text from split_policy
      where effective_from <= $1::date order by effective_from desc limit 1`,
    [onDate],
  );
  if (row) return row;
  const [first] = await sql.query<PolicyRow>(
    `select id, effective_from::text, buffer_pct::text, invest_pct::text from split_policy order by effective_from limit 1`,
  );
  if (!first) throw new Error("No split_policy row exists");
  return first;
}

export async function syncBucketsForTxn(sql: Sql, txnId: string, actor: string): Promise<"paycheck" | "release" | "cleared" | "none"> {
  const [t] = await sql.query<{ id: string; posted_at: string; amount_cents: string; category_id: string | null; is_internal: boolean; pending: boolean }>(
    `select id, posted_at::text, amount_cents::text, category_id, is_internal, pending from txn where id = $1`,
    [txnId],
  );
  if (!t) return "none";
  const amount = centsFromDb(t.amount_cents);
  const isPaycheck = t.category_id === "payroll" && !t.is_internal && !t.pending && amount > 0n;
  const isRelease = (t.category_id === "investment_contribution" || t.category_id === "retirement_contribution") && !t.is_internal && !t.pending && amount < 0n;

  if (isPaycheck) {
    const policy = await policyFor(sql, t.posted_at);
    const s = splitPaycheck(amount, { bufferPct: Number(policy.buffer_pct), investPct: Number(policy.invest_pct) });
    const [pc] = await sql.query<{ id: string; inserted: boolean }>(
      `insert into paycheck (txn_id, policy_id, gross_cents, buffer_cents, invest_cents, living_cents)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (txn_id) do update set policy_id = excluded.policy_id, gross_cents = excluded.gross_cents,
         buffer_cents = excluded.buffer_cents, invest_cents = excluded.invest_cents, living_cents = excluded.living_cents
       returning id, (xmax = 0) as inserted`,
      [t.id, policy.id, s.gross.toString(), s.buffer.toString(), s.invest.toString(), s.living.toString()],
    );
    for (const [bucket, cents] of [["buffer", s.buffer], ["investing", s.invest]] as const) {
      await sql.query(
        `insert into bucket_entry (bucket_id, amount_cents, occurred_on, source, txn_id)
         values ($1, $2, $3, 'paycheck', $4)
         on conflict (bucket_id, txn_id) where txn_id is not null do update set amount_cents = excluded.amount_cents, occurred_on = excluded.occurred_on, source = 'paycheck'`,
        [bucket, cents.toString(), t.posted_at, t.id],
      );
    }
    // Goals with a per-paycheck slice take it out of the living share, never past their target.
    // A goal created after this paycheck is not back-filled: funding starts with the next one.
    const goals = await sql.query<{ id: string; per_paycheck_cents: string; target_cents: string | null; balance: string }>(
      `select b.id, b.per_paycheck_cents::text, b.target_cents::text,
              coalesce((select sum(e.amount_cents) from bucket_entry e where e.bucket_id = b.id and e.txn_id is distinct from $1), 0)::text as balance
         from bucket b where b.kind = 'goal' and b.closed_at is null and b.per_paycheck_cents > 0 and b.created_at <= now()`,
      [t.id],
    );
    for (const g of goals) {
      const room = g.target_cents === null ? centsFromDb(g.per_paycheck_cents) : centsFromDb(g.target_cents) - centsFromDb(g.balance);
      const slice = centsFromDb(g.per_paycheck_cents) < room ? centsFromDb(g.per_paycheck_cents) : room;
      if (slice <= 0n) continue;
      await sql.query(
        `insert into bucket_entry (bucket_id, amount_cents, occurred_on, source, txn_id)
         values ($1, $2, $3, 'paycheck', $4)
         on conflict (bucket_id, txn_id) where txn_id is not null do update set amount_cents = excluded.amount_cents, occurred_on = excluded.occurred_on, source = 'paycheck'`,
        [g.id, slice.toString(), t.posted_at, t.id],
      );
    }
    if (pc.inserted) {
      await writeAudit(sql, { actor, action: "paycheck.split", entity: "paycheck", entityId: pc.id, after: { txn_id: t.id, ...s } });
    }
    return "paycheck";
  }

  if (isRelease) {
    await sql.query(
      `insert into bucket_entry (bucket_id, amount_cents, occurred_on, source, txn_id, note)
       values ('investing', $1, $2, 'release', $3, 'Sent to investments')
       on conflict (bucket_id, txn_id) where txn_id is not null do update set amount_cents = excluded.amount_cents, occurred_on = excluded.occurred_on`,
      [amount.toString(), t.posted_at, t.id],
    );
    return "release";
  }

  // Not (or no longer) a paycheck or a release: drop whatever automatic rows it had.
  const gone = await sql.query<{ id: string }>(`delete from bucket_entry where txn_id = $1 and source <> 'manual' returning id`, [t.id]);
  const pc = await sql.query<{ id: string }>(`delete from paycheck where txn_id = $1 returning id`, [t.id]);
  if (gone.length || pc.length) {
    await writeAudit(sql, { actor, action: "paycheck.unsplit", entity: "txn", entityId: t.id, before: { entries: gone.length, paycheck: pc.length } });
    return "cleared";
  }
  return "none";
}

/** Rebuild every automatic split (after a policy change or a rules re-run). */
export async function resyncAllBuckets(sql: Sql, actor: string): Promise<{ paychecks: number; releases: number }> {
  const rows = await sql.query<{ id: string }>(
    `select id from txn where category_id in ('payroll', 'investment_contribution', 'retirement_contribution')
     union select txn_id from paycheck
     union select txn_id from bucket_entry where txn_id is not null and source <> 'manual'`,
  );
  let paychecks = 0;
  let releases = 0;
  for (const r of rows) {
    const k = await syncBucketsForTxn(sql, r.id, actor);
    if (k === "paycheck") paychecks++;
    if (k === "release") releases++;
  }
  return { paychecks, releases };
}

export interface BucketBalance {
  id: string;
  name: string;
  balance: Cents; // may be negative: more released than funded
  held: Cents; // what the bucket really parks in savings: balance, floored at zero
  funded: Cents;
  released: Cents;
  kind: "split" | "goal";
  target: Cents | null;
  dueOn: string | null;
  perPaycheck: Cents;
}

/** Every open bucket: the two split buckets first, then goals in the order they were made. */
export async function bucketBalances(sql: Sql): Promise<BucketBalance[]> {
  const rows = await sql.query<{ id: string; name: string; balance: string; funded: string; released: string; kind: "split" | "goal"; target_cents: string | null; due_on: string | null; per_paycheck_cents: string }>(
    `select b.id, b.name, b.kind, b.target_cents::text, b.due_on::text, b.per_paycheck_cents::text,
            coalesce(sum(e.amount_cents), 0)::text as balance,
            coalesce(sum(e.amount_cents) filter (where e.amount_cents > 0), 0)::text as funded,
            coalesce(-sum(e.amount_cents) filter (where e.amount_cents < 0), 0)::text as released
       from bucket b left join bucket_entry e on e.bucket_id = b.id
      where b.closed_at is null
      group by b.id, b.name, b.sort, b.kind, b.target_cents, b.due_on, b.per_paycheck_cents, b.created_at
      order by b.kind = 'goal', b.sort, b.created_at`,
  );
  return rows.map((r) => {
    const balance = centsFromDb(r.balance);
    return {
      id: r.id, name: r.name, balance, held: balance > 0n ? balance : 0n, funded: centsFromDb(r.funded), released: centsFromDb(r.released),
      kind: r.kind, target: r.target_cents === null ? null : centsFromDb(r.target_cents), dueOn: r.due_on, perPaycheck: centsFromDb(r.per_paycheck_cents),
    };
  });
}
