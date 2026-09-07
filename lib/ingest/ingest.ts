import { randomUUID } from "node:crypto";
import { writeAudit } from "../audit.ts";
import { syncBucketsForTxn } from "../buckets/index.ts";
import { categorizeTxn, loadCategoryContext } from "../categories/index.ts";
import type { Sql } from "../db.ts";
import { centsFromDb } from "../money.ts";
import type { AccountProvider, Connection, IsoDate, NormalizedAccount, NormalizedSecurity, NormalizedTxn, ProviderId } from "../providers/types.ts";
import { dedupeHash } from "./hash.ts";
import { pickPartner, TRANSFER_WINDOW_DAYS, type TransferCandidate } from "./transfers.ts";

/**
 * The normalizer + store step. Takes whatever a provider produced and lands it
 * in Postgres: accounts upserted, balances snapshotted, transactions inserted
 * with a dedupe hash, internal transfers paired. Nothing here knows which
 * provider it is talking to.
 *
 * Every statement is idempotent, so re-running after a partial failure is safe
 * even though Neon-over-HTTP gives us no interactive transaction.
 */

export interface IngestOptions {
  actor: string;
  since: IsoDate;
  ip?: string | null;
}

export interface IngestResult {
  accountsUpserted: number;
  balancesUpserted: number;
  txnsInserted: number;
  txnsUpdated: number;
  txnsUnchanged: number;
  txnsRemoved: number;
  transfersPaired: number;
  holdingsUpserted: number;
  investmentTxnsUpserted: number;
}

interface AccountRow {
  id: string;
  external_id: string;
}

interface TxnRow {
  id: string;
  account_id: string;
  posted_at: string;
  amount_cents: string;
  transfer_group_id: string | null;
  is_internal_manual: boolean;
  inserted?: boolean;
}

export async function ingestConnection(
  sql: Sql,
  provider: AccountProvider,
  conn: Connection,
  opts: IngestOptions,
): Promise<IngestResult> {
  if (provider.id !== conn.provider) {
    throw new Error(`Provider ${provider.id} cannot ingest a ${conn.provider} connection`);
  }
  const result: IngestResult = {
    accountsUpserted: 0,
    balancesUpserted: 0,
    txnsInserted: 0,
    txnsUpdated: 0,
    txnsUnchanged: 0,
    txnsRemoved: 0,
    transfersPaired: 0,
    holdingsUpserted: 0,
    investmentTxnsUpserted: 0,
  };

  // 1. Accounts
  for (const a of await provider.listAccounts(conn)) {
    const [row] = await sql.query<AccountRow & { inserted: boolean }>(
      `insert into account (institution_id, external_id, name, official_name, mask, type, subtype, currency, role, apy)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (institution_id, external_id) do update
         set name = excluded.name, official_name = excluded.official_name, mask = excluded.mask,
             type = excluded.type, subtype = excluded.subtype, currency = excluded.currency,
             apy = coalesce(excluded.apy, account.apy)
       returning id, external_id, (xmax = 0) as inserted`,
      [conn.institutionId, a.externalId, a.name, a.officialName ?? null, a.mask ?? null, a.type, a.subtype, a.currency, defaultRole(a), a.apy ?? null],
    );
    result.accountsUpserted++;
    await writeAudit(sql, {
      actor: opts.actor,
      action: row.inserted ? "account.insert" : "account.upsert",
      entity: "account",
      entityId: row.id,
      after: a,
      ip: opts.ip,
    });
  }

  const accountIds = await accountIdMap(sql, conn.institutionId);
  const categories = await loadCategoryContext(sql);
  const balanceSource = provider.id === "manual" ? "manual" : "sync";

  // 2. Balances
  for (const b of await provider.fetchBalances(conn)) {
    const accountId = requireAccount(accountIds, b.accountExternalId);
    const [row] = await sql.query<{ id: string }>(
      `insert into balance_snapshot (account_id, as_of, current_cents, available_cents, source)
       values ($1, $2, $3, $4, $5)
       on conflict (account_id, as_of, source) do update
         set current_cents = excluded.current_cents, available_cents = excluded.available_cents
       returning id`,
      [accountId, b.asOf, b.current.toString(), b.available === null ? null : b.available.toString(), balanceSource],
    );
    result.balancesUpserted++;
    await writeAudit(sql, {
      actor: opts.actor,
      action: "balance_snapshot.upsert",
      entity: "balance_snapshot",
      entityId: row.id,
      after: b,
      ip: opts.ip,
    });
  }

  // 3. Transactions — incremental when the provider has a cursor, full pull otherwise.
  const touched: TxnRow[] = [];
  let txns: NormalizedTxn[];
  let nextCursor: string | null = null;
  if (provider.fetchChanges) {
    const changes = await provider.fetchChanges(conn);
    // Removals first: a pending row being replaced by its posted twin may hash
    // identically, and we want the posted one to land cleanly.
    for (const r of changes.removed) {
      const accountId = accountIds.get(r.accountExternalId);
      if (!accountId) continue;
      if (await removeTxn(sql, accountId, r.externalId, opts)) result.txnsRemoved++;
    }
    txns = changes.upserts;
    nextCursor = changes.nextCursor;
  } else {
    txns = await provider.fetchTransactions(conn, opts.since);
  }
  for (const t of txns) {
    const accountId = requireAccount(accountIds, t.accountExternalId);
    const outcome = await upsertTxn(sql, accountId, provider.id, t);
    if (outcome.kind === "inserted") result.txnsInserted++;
    else if (outcome.kind === "updated") result.txnsUpdated++;
    else result.txnsUnchanged++;
    if (outcome.kind !== "unchanged") {
      await writeAudit(sql, {
        actor: opts.actor,
        action: `txn.${outcome.kind === "inserted" ? "insert" : "update"}`,
        entity: "txn",
        entityId: outcome.row.id,
        before: outcome.before,
        after: t,
        ip: opts.ip,
      });
    }
    if (outcome.kind !== "unchanged") {
      await categorizeTxn(sql, categories, outcome.row.id);
      await syncBucketsForTxn(sql, outcome.row.id, opts.actor);
    }
    if (outcome.kind === "inserted") touched.push(outcome.row);
  }

  // 4. Pair internal transfers for anything new
  for (const row of touched) {
    const paired = await pairTransfer(sql, row, opts);
    if (paired) result.transfersPaired++;
  }

  // 5. Investments, only where there is an investment account to ask about.
  const investmentAccounts = await sql.query<{ id: string; external_id: string }>(
    `select id, external_id from account where institution_id = $1 and type = 'investment' and is_active`,
    [conn.institutionId],
  );
  if (investmentAccounts.length && provider.fetchHoldings && provider.fetchInvestmentTransactions) {
    const { securities, holdings } = await provider.fetchHoldings(conn);
    const secIds = await upsertSecurities(sql, securities);
    for (const h of holdings) {
      const accountId = accountIds.get(h.accountExternalId);
      const securityId = secIds.get(h.securityExternalId);
      if (!accountId || !securityId) continue;
      await sql.query(
        `insert into holding (account_id, security_id, quantity, institution_price_cents, institution_value_cents, cost_basis_cents, as_of)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (account_id, security_id) do update set quantity = excluded.quantity, institution_price_cents = excluded.institution_price_cents,
           institution_value_cents = excluded.institution_value_cents, cost_basis_cents = excluded.cost_basis_cents, as_of = excluded.as_of, updated_at = now()`,
        [accountId, securityId, h.quantity, h.institutionPrice?.toString() ?? null, h.institutionValue.toString(), h.costBasis?.toString() ?? null, h.asOf],
      );
      result.holdingsUpserted++;
    }
    // Positions that vanished from the provider are gone.
    const keep = holdings.map((h) => `${accountIds.get(h.accountExternalId)}|${secIds.get(h.securityExternalId)}`);
    for (const a of investmentAccounts) {
      const rows = await sql.query<{ id: string; security_id: string }>(`select id, security_id from holding where account_id = $1`, [a.id]);
      for (const r of rows) if (!keep.includes(`${a.id}|${r.security_id}`)) await sql.query(`delete from holding where id = $1`, [r.id]);
    }

    const sinceInv = (await sql.query<{ d: string | null }>(`select (max(posted_at) - 30)::text as d from investment_txn where account_id = any($1::uuid[])`, [investmentAccounts.map((a) => a.id)]))[0].d;
    const inv = await provider.fetchInvestmentTransactions(conn, sinceInv ?? "2000-01-01");
    const secIds2 = await upsertSecurities(sql, inv.securities);
    for (const t of inv.transactions) {
      const accountId = accountIds.get(t.accountExternalId);
      if (!accountId) continue;
      await sql.query(
        `insert into investment_txn (account_id, external_id, security_id, posted_at, name, type, subtype, quantity, amount_cents, price_cents, fees_cents)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (external_id) do update set security_id = excluded.security_id, posted_at = excluded.posted_at, name = excluded.name, type = excluded.type,
           subtype = excluded.subtype, quantity = excluded.quantity, amount_cents = excluded.amount_cents, price_cents = excluded.price_cents, fees_cents = excluded.fees_cents`,
        [accountId, t.externalId, t.securityExternalId ? (secIds2.get(t.securityExternalId) ?? null) : null, t.postedAt, t.name, t.type, t.subtype, t.quantity, t.amount.toString(), t.price?.toString() ?? null, t.fees?.toString() ?? null],
      );
      result.investmentTxnsUpserted++;
    }
  }

  // Only now is it safe to advance the cursor: everything before it has landed.
  await sql.query(`update institution set last_synced_at = now(), sync_cursor = coalesce($2, sync_cursor) where id = $1`, [
    conn.institutionId,
    nextCursor,
  ]);
  return result;
}

/**
 * A provider told us a transaction no longer exists (usually a pending one
 * that has now posted under a new id). Delete it.
 */
async function removeTxn(sql: Sql, accountId: string, externalId: string, opts: IngestOptions): Promise<boolean> {
  const [row] = await sql.query<TxnRow & { description: string }>(
    `select t.id, t.account_id, t.posted_at::text, t.amount_cents::text, t.description, t.transfer_group_id, t.is_internal_manual
       from txn t where t.account_id = $1 and t.external_id = $2`,
    [accountId, externalId],
  );
  if (!row) return false;
  // Free the other leg if this one was half of a transfer pair.
  if (row.transfer_group_id) {
    await sql.query(`update txn set transfer_group_id = null, is_internal = false where transfer_group_id = $1 and id <> $2 and is_internal_manual = false`, [
      row.transfer_group_id,
      row.id,
    ]);
  }
  await sql.query(`delete from txn where id = $1`, [row.id]);
  await writeAudit(sql, {
    actor: opts.actor,
    action: "txn.remove",
    entity: "txn",
    entityId: row.id,
    before: { external_id: externalId, posted_at: row.posted_at, amount_cents: row.amount_cents, description: row.description },
    ip: opts.ip,
  });
  return true;
}

async function upsertSecurities(sql: Sql, securities: NormalizedSecurity[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const s of securities) {
    const [row] = await sql.query<{ id: string }>(
      `insert into security (external_id, ticker, name, type, close_price_cents, close_price_as_of)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (external_id) do update set ticker = excluded.ticker, name = excluded.name, type = excluded.type,
         close_price_cents = coalesce(excluded.close_price_cents, security.close_price_cents), close_price_as_of = coalesce(excluded.close_price_as_of, security.close_price_as_of)
       returning id`,
      [s.externalId, s.ticker, s.name, s.type, s.closePrice?.toString() ?? null, s.closePriceAsOf],
    );
    ids.set(s.externalId, row.id);
  }
  return ids;
}

function defaultRole(a: NormalizedAccount): string {
  if (a.type === "investment") return "investment";
  if (a.type === "credit") return "credit";
  if (a.type === "depository") return a.subtype === "hysa" ? "long_term_savings" : "cash";
  return "other";
}

async function accountIdMap(sql: Sql, institutionId: string): Promise<Map<string, string>> {
  const rows = await sql.query<AccountRow>(`select id, external_id from account where institution_id = $1`, [
    institutionId,
  ]);
  return new Map(rows.map((r) => [r.external_id, r.id]));
}

function requireAccount(map: Map<string, string>, externalId: string): string {
  const id = map.get(externalId);
  if (!id) throw new Error(`Unknown account "${externalId}" for this institution`);
  return id;
}

type UpsertOutcome =
  | { kind: "inserted"; row: TxnRow; before?: undefined }
  | { kind: "updated"; row: TxnRow; before: Record<string, unknown> }
  | { kind: "unchanged"; row: TxnRow };

async function upsertTxn(sql: Sql, accountId: string, source: ProviderId, t: NormalizedTxn): Promise<UpsertOutcome> {
  const hash = dedupeHash(accountId, t.postedAt, t.amount, t.description);
  const amount = t.amount.toString();

  // A synced row that already exists by external_id may have drifted
  // (pending → posted often rewrites the description). Update it in place.
  if (t.externalId !== null) {
    const [existing] = await sql.query<TxnRow & { description: string; pending: boolean; category: string | null; dedupe_hash: Uint8Array }>(
      `select id, account_id, posted_at::text, amount_cents::text, description, pending, category, dedupe_hash,
              transfer_group_id, is_internal_manual
         from txn where account_id = $1 and external_id = $2`,
      [accountId, t.externalId],
    );
    if (existing) {
      const same =
        existing.posted_at === t.postedAt &&
        existing.amount_cents === amount &&
        existing.description === t.description &&
        existing.pending === t.pending &&
        (t.category == null || existing.category === t.category);
      if (same) return { kind: "unchanged", row: existing };
      await sql.query(
        `update txn set posted_at = $3, amount_cents = $4, description = $5, pending = $6, dedupe_hash = $7, category = coalesce($8, category), updated_at = now()
          where account_id = $1 and external_id = $2`,
        [accountId, t.externalId, t.postedAt, amount, t.description, t.pending, hash, t.category ?? null],
      );
      const before = {
        posted_at: existing.posted_at,
        amount_cents: existing.amount_cents,
        description: existing.description,
        pending: existing.pending,
      };
      return { kind: "updated", row: { ...existing, posted_at: t.postedAt, amount_cents: amount }, before };
    }
  }

  // Otherwise insert by hash. On conflict the row carrying an external_id wins:
  // a synced row landing on a hand-entered one claims it.
  const [row] = await sql.query<TxnRow>(
    `insert into txn (account_id, external_id, posted_at, amount_cents, description, pending, source, dedupe_hash, category)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (account_id, dedupe_hash) do update
       set external_id = coalesce(excluded.external_id, txn.external_id),
           source      = case when excluded.external_id is not null then excluded.source else txn.source end,
           pending     = case when excluded.external_id is not null then excluded.pending else txn.pending end,
           updated_at  = case when excluded.external_id is not null then now() else txn.updated_at end
     returning id, account_id, posted_at::text, amount_cents::text, transfer_group_id, is_internal_manual,
               (xmax = 0) as inserted`,
    [accountId, t.externalId, t.postedAt, amount, t.description, t.pending, source, hash, t.category ?? null],
  );
  if (row.inserted) return { kind: "inserted", row };
  if (t.externalId !== null) return { kind: "updated", row, before: { external_id: null } };
  return { kind: "unchanged", row };
}

async function pairTransfer(sql: Sql, row: TxnRow, opts: IngestOptions): Promise<boolean> {
  // Re-read: an earlier iteration of this loop may have paired it already.
  const [fresh] = await sql.query<TxnRow>(
    `select id, account_id, posted_at::text, amount_cents::text, transfer_group_id, is_internal_manual
       from txn where id = $1`,
    [row.id],
  );
  const me = toCandidate(fresh);
  if (me.transferGroupId !== null || me.isInternalManual || me.amountCents === 0n) return false;

  const rows = await sql.query<TxnRow>(
    `select id, account_id, posted_at::text, amount_cents::text, transfer_group_id, is_internal_manual
       from txn
      where account_id <> $1
        and amount_cents = $2
        and posted_at between ($3::date - $4::int) and ($3::date + $4::int)
        and transfer_group_id is null
        and is_internal_manual = false`,
    [me.accountId, (-me.amountCents).toString(), me.postedAt, TRANSFER_WINDOW_DAYS],
  );
  const partner = pickPartner(me, rows.map(toCandidate));
  if (!partner) return false;

  const groupId = randomUUID();
  const updated = await sql.query<{ id: string }>(
    `update txn set transfer_group_id = $1, is_internal = true, updated_at = now()
      where id = any($2::uuid[]) and transfer_group_id is null and is_internal_manual = false
      returning id`,
    [groupId, [me.id, partner.id]],
  );
  if (updated.length !== 2) {
    // Lost a race with a concurrent pairing; undo the half-set group.
    await sql.query(`update txn set transfer_group_id = null, is_internal = false where transfer_group_id = $1`, [
      groupId,
    ]);
    return false;
  }
  await sql.query(`update txn set category_id = 'internal_transfer', category_source = 'rule' where id = any($1::uuid[]) and category_source is distinct from 'manual'`, [
    [me.id, partner.id],
  ]);
  await syncBucketsForTxn(sql, me.id, opts.actor);
  await syncBucketsForTxn(sql, partner.id, opts.actor);
  for (const id of [me.id, partner.id]) {
    await writeAudit(sql, {
      actor: opts.actor,
      action: "txn.pair_transfer",
      entity: "txn",
      entityId: id,
      before: { transfer_group_id: null, is_internal: false },
      after: { transfer_group_id: groupId, is_internal: true },
      ip: opts.ip,
    });
  }
  return true;
}

function toCandidate(r: TxnRow): TransferCandidate {
  return {
    id: r.id,
    accountId: r.account_id,
    postedAt: r.posted_at,
    amountCents: centsFromDb(r.amount_cents),
    transferGroupId: r.transfer_group_id,
    isInternalManual: r.is_internal_manual,
  };
}
