import "server-only";
import { getSql } from "../db.ts";
import { centsFromDb, type Cents } from "../money.ts";
import type { AccountSubtype, AccountType } from "../providers/types.ts";
import { shortAccountName } from "../names.ts";

/**
 * Income = transactions whose category is in the 'income' group and marked
 * spendable (payroll, other work income, tax refunds). Passive income
 * (interest, dividends) is real for taxes and reported separately; it is
 * never money to spend.
 */
export interface IncomeEntry {
  id: string;
  postedAt: string;
  description: string;
  amount: Cents;
  pending: boolean;
  source: string;
  categoryId: string;
  categoryName: string;
  accountName: string;
  accountExternalId: string;
  institutionName: string;
  living: Cents | null;
}

export interface IncomeSummary {
  year: number;
  total: Cents;
  count: number;
  firstOn: string | null;
  lastOn: string | null;
  passive: Cents;
}

export interface AccountOption {
  id: string;
  externalId: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  institutionName: string;
}

export async function listIncomeEntries(limit = 500): Promise<IncomeEntry[]> {
  const rows = await getSql().query<{
    id: string; posted_at: string; description: string; amount_cents: string; pending: boolean; source: string;
    category_id: string; category_name: string; account_name: string; account_external_id: string; institution_name: string; living: string | null;
  }>(
    `select t.id, t.posted_at::text, t.description, t.amount_cents::text, t.pending, t.source,
            c.id as category_id, c.name as category_name,
            a.name as account_name, a.external_id as account_external_id, i.name as institution_name,
            p.living_cents::text as living
       from txn t
       join category c on c.id = t.category_id
       join account a on a.id = t.account_id
       join institution i on i.id = a.institution_id
       left join paycheck p on p.txn_id = t.id
      where c."group" = 'income' and c.is_spendable_income and not t.is_internal
      order by t.posted_at desc, t.created_at desc
      limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id, postedAt: r.posted_at, description: r.description, amount: centsFromDb(r.amount_cents), pending: r.pending, source: r.source,
    categoryId: r.category_id, categoryName: r.category_name, accountName: shortAccountName(r.account_name), accountExternalId: r.account_external_id, institutionName: r.institution_name,
    living: r.living === null ? null : centsFromDb(r.living),
  }));
}

export async function incomeSummary(year: number): Promise<IncomeSummary> {
  const [row] = await getSql().query<{ total: string; count: string; first_on: string | null; last_on: string | null; passive: string }>(
    `select coalesce(sum(t.amount_cents) filter (where c."group" = 'income' and c.is_spendable_income), 0)::text as total,
            count(*) filter (where c."group" = 'income' and c.is_spendable_income)::text as count,
            min(t.posted_at) filter (where c."group" = 'income' and c.is_spendable_income)::text as first_on,
            max(t.posted_at) filter (where c."group" = 'income' and c.is_spendable_income)::text as last_on,
            coalesce(sum(t.amount_cents) filter (where c."group" = 'passive_income'), 0)::text as passive
       from txn t join category c on c.id = t.category_id
      where not t.is_internal and not t.pending
        and t.posted_at >= make_date($1, 1, 1) and t.posted_at < make_date($1 + 1, 1, 1)`,
    [year],
  );
  return { year, total: centsFromDb(row.total), count: Number(row.count), firstOn: row.first_on, lastOn: row.last_on, passive: centsFromDb(row.passive) };
}

/** Accounts that accept hand-entered rows: the manual institution only. */
export async function listAccounts(): Promise<AccountOption[]> {
  const rows = await getSql().query<{ id: string; external_id: string; name: string; type: AccountType; subtype: AccountSubtype; institution_name: string }>(
    `select a.id, a.external_id, a.name, a.type, a.subtype, i.name as institution_name
       from account a join institution i on i.id = a.institution_id
      where a.is_active and i.provider = 'manual'
      order by a.name`,
  );
  return rows.map((r) => ({ id: r.id, externalId: r.external_id, name: r.name, type: r.type, subtype: r.subtype, institutionName: r.institution_name }));
}

export interface IncomeMonth {
  month: string; // YYYY-MM
  income: Cents; // spendable
  passive: Cents;
}

/** Spendable and passive income by month for the trailing year. */
export async function incomeByMonth(months = 12): Promise<IncomeMonth[]> {
  const rows = await getSql().query<{ month: string; income: string; passive: string }>(
    `select to_char(date_trunc('month', t.posted_at), 'YYYY-MM') as month,
            coalesce(sum(t.amount_cents) filter (where c."group" = 'income' and c.is_spendable_income), 0)::text as income,
            coalesce(sum(t.amount_cents) filter (where c."group" = 'passive_income'), 0)::text as passive
       from txn t join category c on c.id = t.category_id
      where not t.is_internal and not t.pending
        and t.posted_at >= (date_trunc('month', current_date) - ($1::int - 1) * interval '1 month')::date
      group by 1 order by 1`,
    [months],
  );
  return rows.map((r) => ({ month: r.month, income: centsFromDb(r.income), passive: centsFromDb(r.passive) }));
}

export interface SplitTotals {
  gross: Cents;
  buffer: Cents;
  invest: Cents;
  living: Cents;
  count: number;
}

/** Where the year's paychecks went, summed across every split row. */
export async function splitTotals(year: number): Promise<SplitTotals> {
  const [row] = await getSql().query<{ gross: string; buffer: string; invest: string; living: string; count: string }>(
    `select coalesce(sum(p.gross_cents), 0)::text as gross,
            coalesce(sum(p.buffer_cents), 0)::text as buffer, coalesce(sum(p.invest_cents), 0)::text as invest,
            coalesce(sum(p.living_cents), 0)::text as living, count(*)::text as count
       from paycheck p join txn t on t.id = p.txn_id
      where t.posted_at >= make_date($1, 1, 1) and t.posted_at < make_date($1 + 1, 1, 1)`,
    [year],
  );
  return { gross: centsFromDb(row.gross), buffer: centsFromDb(row.buffer), invest: centsFromDb(row.invest), living: centsFromDb(row.living), count: Number(row.count) };
}
