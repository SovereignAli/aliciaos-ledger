import "server-only";
import { getSql } from "../db.ts";
import { centsFromDb, type Cents } from "../money.ts";
import type { Role } from "./overview.ts";
import { shortAccountName } from "../names.ts";

export interface TxnView {
  id: string;
  postedAt: string;
  description: string;
  amount: Cents;
  pending: boolean;
  isInternal: boolean;
  isInternalManual: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryGroup: string | null;
  categorySource: "rule" | "provider" | "manual" | null;
  providerHint: string | null;
  accountId: string;
  accountName: string;
  accountRole: Role;
  institutionName: string;
  /** Where the row came from: a bank feed or a hand entry. */
  source: "manual" | "simplefin" | "plaid";
  externalId: string | null;
  firstSeenAt: string;
  /** The other leg, when this row is half of an internal transfer. */
  partner: { accountName: string; institutionName: string; postedAt: string } | null;
}

export interface TxnFilter {
  accountId?: string;
  role?: Role;
  categoryId?: string;
  group?: string;
  month?: string; // YYYY-MM
  includeInternal?: boolean;
  /** Case-insensitive substring of the description. */
  search?: string;
  limit?: number;
}

export async function listTransactions(f: TxnFilter = {}): Promise<TxnView[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.accountId) where.push(`t.account_id = ${p(f.accountId)}`);
  if (f.role) where.push(`a.role = ${p(f.role)}`);
  if (f.categoryId === "uncategorized") where.push(`t.category_id is null`);
  else if (f.categoryId) where.push(`t.category_id = ${p(f.categoryId)}`);
  if (f.group) where.push(`c."group" = ${p(f.group)}`);
  if (f.month) where.push(`to_char(t.posted_at, 'YYYY-MM') = ${p(f.month)}`);
  if (f.search?.trim()) where.push(`t.description ilike ${p("%" + f.search.trim().replace(/[%_\\]/g, (c) => "\\" + c) + "%")}`);
  if (!f.includeInternal) where.push(`not t.is_internal`);
  const limit = p(f.limit ?? 300);
  const rows = await getSql().query<{
    id: string; posted_at: string; description: string; amount_cents: string; pending: boolean; is_internal: boolean; is_internal_manual: boolean;
    category_id: string | null; category_name: string | null; category_group: string | null; category_source: TxnView["categorySource"]; category: string | null;
    account_id: string; account_name: string; role: Role; institution_name: string;
    source: TxnView["source"]; external_id: string | null; created_at: string;
    partner_account: string | null; partner_institution: string | null; partner_posted_at: string | null;
  }>(
    `select t.id, t.posted_at::text, t.description, t.amount_cents::text, t.pending, t.is_internal, t.is_internal_manual,
            t.category_id, c.name as category_name, c."group" as category_group, t.category_source, t.category,
            a.id as account_id, a.name as account_name, a.role, i.name as institution_name,
            t.source, t.external_id, t.created_at::text,
            pa.name as partner_account, pi.name as partner_institution, pt.posted_at::text as partner_posted_at
       from txn t
       join account a on a.id = t.account_id
       join institution i on i.id = a.institution_id
       left join category c on c.id = t.category_id
       left join txn pt on t.transfer_group_id is not null and pt.transfer_group_id = t.transfer_group_id and pt.id <> t.id
       left join account pa on pa.id = pt.account_id
       left join institution pi on pi.id = pa.institution_id
      ${where.length ? "where " + where.join(" and ") : ""}
      order by t.posted_at desc, t.created_at desc
      limit ${limit}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    postedAt: r.posted_at,
    description: r.description,
    amount: centsFromDb(r.amount_cents),
    pending: r.pending,
    isInternal: r.is_internal,
    isInternalManual: r.is_internal_manual,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryGroup: r.category_group,
    categorySource: r.category_source,
    providerHint: r.category,
    accountId: r.account_id,
    accountName: shortAccountName(r.account_name),
    accountRole: r.role,
    institutionName: r.institution_name,
    source: r.source,
    externalId: r.external_id,
    firstSeenAt: r.created_at,
    partner: r.partner_account && r.partner_posted_at
      ? { accountName: shortAccountName(r.partner_account), institutionName: r.partner_institution ?? "", postedAt: r.partner_posted_at }
      : null,
  }));
}

export interface CategoryOption {
  id: string;
  name: string;
  group: string;
  isSpendableIncome: boolean;
}

export async function listCategories(): Promise<CategoryOption[]> {
  const rows = await getSql().query<{ id: string; name: string; group: string; is_spendable_income: boolean }>(
    `select id, name, "group", is_spendable_income from category order by sort, name`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, group: r.group, isSpendableIncome: r.is_spendable_income }));
}

export interface AccountView {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string;
  role: Role;
  institutionName: string;
  institutionStatus: string;
  balance: Cents | null;
  balanceAsOf: string | null;
  apy: number | null;
}

export async function listHiddenAccounts(): Promise<Array<{ id: string; name: string; institutionName: string; role: Role }>> {
  const rows = await getSql().query<{ id: string; name: string; institution_name: string; role: Role }>(
    `select a.id, a.name, i.name as institution_name, a.role from account a join institution i on i.id = a.institution_id
      where not a.is_active and i.provider <> 'manual' order by i.name, a.name`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, institutionName: r.institution_name, role: r.role }));
}

export async function listAccountsByRole(role?: Role): Promise<AccountView[]> {
  const rows = await getSql().query<{
    id: string; name: string; official_name: string | null; mask: string | null; type: string; subtype: string; role: Role;
    institution_name: string; status: string; current_cents: string | null; as_of: string | null; apy: string | null;
  }>(
    `select a.id, a.name, a.official_name, a.mask, a.type, a.subtype, a.role, i.name as institution_name, i.status, a.apy::text,
            b.current_cents::text, b.as_of::text
       from account a
       join institution i on i.id = a.institution_id
       left join lateral (
         select current_cents, as_of from balance_snapshot where account_id = a.id order by as_of desc, created_at desc limit 1
       ) b on true
      where a.is_active ${role ? "and a.role = $1" : ""}
      order by i.name, a.name`,
    role ? [role] : [],
  );
  return rows.map((r) => ({
    id: r.id,
    name: shortAccountName(r.name),
    officialName: r.official_name,
    mask: r.mask,
    type: r.type,
    subtype: r.subtype,
    role: r.role,
    institutionName: r.institution_name,
    institutionStatus: r.status,
    balance: r.current_cents === null ? null : centsFromDb(r.current_cents),
    balanceAsOf: r.as_of,
    apy: r.apy === null ? null : Number(r.apy),
  }));
}

/** Balance history for one or more accounts, oldest first. */
export async function balanceHistory(accountIds: string[]): Promise<Array<{ accountId: string; asOf: string; current: Cents }>> {
  if (accountIds.length === 0) return [];
  const rows = await getSql().query<{ account_id: string; as_of: string; current_cents: string }>(
    `select account_id, as_of::text, current_cents::text from balance_snapshot
      where account_id = any($1::uuid[]) order by as_of`,
    [accountIds],
  );
  return rows.map((r) => ({ accountId: r.account_id, asOf: r.as_of, current: centsFromDb(r.current_cents) }));
}

/** Sum of a category group into/out of a set of accounts for a year. */
export async function yearTotals(accountIds: string[], year: number): Promise<{ inflow: Cents; outflow: Cents; passive: Cents; contributions: Cents }> {
  if (accountIds.length === 0) return { inflow: 0n, outflow: 0n, passive: 0n, contributions: 0n };
  const [r] = await getSql().query<{ inflow: string; outflow: string; passive: string; contributions: string }>(
    `select coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::text as inflow,
            coalesce(-sum(t.amount_cents) filter (where t.amount_cents < 0), 0)::text as outflow,
            coalesce(sum(t.amount_cents) filter (where c."group" = 'passive_income'), 0)::text as passive,
            coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0 and (c."group" is null or c."group" not in ('passive_income'))), 0)::text as contributions
       from txn t left join category c on c.id = t.category_id
      where t.account_id = any($1::uuid[]) and not t.pending
        and t.posted_at >= make_date($2, 1, 1) and t.posted_at < make_date($2 + 1, 1, 1)`,
    [accountIds, year],
  );
  return { inflow: centsFromDb(r.inflow), outflow: centsFromDb(r.outflow), passive: centsFromDb(r.passive), contributions: centsFromDb(r.contributions) };
}
