import "server-only";
import { getSql } from "../db.ts";
import { centsFromDb, type Cents } from "../money.ts";

export type Role = "cash" | "long_term_savings" | "investment" | "credit" | "other";

export interface RoleTotal {
  role: Role;
  total: Cents;
  accounts: number;
}

/** Latest balance per active account, summed by role. Credit balances count against net worth. */
export async function netWorthByRole(): Promise<{ roles: RoleTotal[]; netWorth: Cents }> {
  const rows = await getSql().query<{ role: Role; total: string; accounts: string }>(
    `select a.role, coalesce(sum(b.current_cents), 0)::text as total, count(*)::text as accounts
       from account a
       left join lateral (
         select current_cents from balance_snapshot where account_id = a.id order by as_of desc, created_at desc limit 1
       ) b on true
      where a.is_active
      group by a.role`,
  );
  const roles = rows.map((r) => ({ role: r.role, total: centsFromDb(r.total), accounts: Number(r.accounts) }));
  const netWorth = roles.reduce((s, r) => (r.role === "credit" ? s - r.total : s + r.total), 0n);
  return { roles, netWorth };
}

export interface MonthFlow {
  month: string; // YYYY-MM
  income: Cents; // spendable income
  passive: Cents;
  spending: Cents; // positive number
  debtPayments: Cents;
  investing: Cents;
}

/** Cash flow by month from categorized, non-internal transactions. */
export async function cashFlowByMonth(months = 6): Promise<MonthFlow[]> {
  const rows = await getSql().query<{
    month: string; income: string; passive: string; spending: string; debt: string; investing: string;
  }>(
    `with m as (
       select to_char(date_trunc('month', t.posted_at), 'YYYY-MM') as month, t.amount_cents, c."group", c.is_spendable_income
         from txn t
         left join category c on c.id = t.category_id
        where not t.is_internal and not t.pending
          and t.posted_at >= (date_trunc('month', current_date) - ($1::int - 1) * interval '1 month')::date
     )
     select month,
            coalesce(sum(amount_cents) filter (where "group" = 'income' and is_spendable_income), 0)::text as income,
            coalesce(sum(amount_cents) filter (where "group" = 'passive_income'), 0)::text as passive,
            coalesce(-sum(amount_cents) filter (where "group" = 'spending' or "group" is null and amount_cents < 0), 0)::text as spending,
            coalesce(-sum(amount_cents) filter (where "group" = 'debt'), 0)::text as debt,
            coalesce(-sum(amount_cents) filter (where "group" = 'investing'), 0)::text as investing
       from m group by month order by month`,
    [months],
  );
  return rows.map((r) => ({
    month: r.month,
    income: centsFromDb(r.income),
    passive: centsFromDb(r.passive),
    spending: centsFromDb(r.spending),
    debtPayments: centsFromDb(r.debt),
    investing: centsFromDb(r.investing),
  }));
}

export interface CategoryMonth {
  categoryId: string;
  name: string;
  group: string;
  month: string;
  total: Cents; // outflow as positive
}

/** Spending by category by month, the seed for budget targets. */
export async function spendingByCategory(months = 6): Promise<CategoryMonth[]> {
  const rows = await getSql().query<{ category_id: string; name: string; group: string; month: string; total: string }>(
    `select coalesce(c.id, 'uncategorized') as category_id, coalesce(c.name, 'Uncategorized') as name, coalesce(c."group", 'spending') as "group",
            to_char(date_trunc('month', t.posted_at), 'YYYY-MM') as month, (-sum(t.amount_cents))::text as total
       from txn t
       left join category c on c.id = t.category_id
      where not t.is_internal and not t.pending and t.amount_cents < 0
        and (c."group" = 'spending' or c.id is null)
        and t.posted_at >= (date_trunc('month', current_date) - ($1::int - 1) * interval '1 month')::date
      group by 1, 2, 3, 4 order by 4, 5 desc`,
    [months],
  );
  return rows.map((r) => ({ categoryId: r.category_id, name: r.name, group: r.group, month: r.month, total: centsFromDb(r.total) }));
}

/** Latest balance per role as of a past date, for trend arrows. */
export async function netWorthByRoleAt(asOf: string): Promise<Map<Role, Cents>> {
  const rows = await getSql().query<{ role: Role; total: string }>(
    `select a.role, coalesce(sum(b.current_cents), 0)::text as total
       from account a
       left join lateral (
         select current_cents from balance_snapshot where account_id = a.id and as_of <= $1::date order by as_of desc, created_at desc limit 1
       ) b on true
      where a.is_active
      group by a.role
     having count(b.current_cents) > 0`,
    [asOf],
  );
  return new Map(rows.map((r) => [r.role, centsFromDb(r.total)]));
}

/** Bucket money held as of a date: every positive bucket's running balance at that point. */
export async function bucketsHeldAt(asOf: string): Promise<Cents> {
  const [row] = await getSql().query<{ held: string }>(
    `select coalesce(sum(greatest(bal, 0)), 0)::text as held
       from (select bucket_id, sum(amount_cents) as bal from bucket_entry where occurred_on <= $1::date group by bucket_id) t`,
    [asOf],
  );
  return centsFromDb(row.held);
}

/** Spending this month per category, and the targets in effect, for the budget view. */
export interface BudgetLine {
  categoryId: string;
  name: string;
  spent: Cents;
  target: Cents | null;
  avg3: Cents; // average of the previous three full months
}

export async function budgetLines(month: string): Promise<BudgetLine[]> {
  const rows = await getSql().query<{ category_id: string; name: string; spent: string; target: string | null; avg3: string }>(
    `with spend as (
       select coalesce(t.category_id, 'uncategorized') as category_id,
              coalesce(-sum(t.amount_cents) filter (where date_trunc('month', t.posted_at) = $1::date), 0) as spent,
              coalesce(-sum(t.amount_cents) filter (where t.posted_at >= ($1::date - interval '3 months') and t.posted_at < $1::date), 0) / 3 as avg3
         from txn t left join category c on c.id = t.category_id
        where not t.is_internal and not t.pending and t.amount_cents < 0 and (c."group" = 'spending' or c.id is null)
          and t.posted_at >= ($1::date - interval '3 months')
        group by 1
     ), targets as (
       select distinct on (category_id) category_id, target_cents
         from budget_target where effective_from <= $1::date order by category_id, effective_from desc
     )
     select c.id as category_id, c.name, coalesce(s.spent, 0)::text as spent, t.target_cents::text as target, coalesce(s.avg3, 0)::bigint::text as avg3
       from category c
       left join spend s on s.category_id = c.id
       left join targets t on t.category_id = c.id
      where c."group" = 'spending'
     union all
     select 'uncategorized', 'Uncategorized', s.spent::text, null, s.avg3::bigint::text from spend s where s.category_id = 'uncategorized'`,
    [`${month}-01`],
  );
  return rows
    .map((r) => ({ categoryId: r.category_id, name: r.name, spent: centsFromDb(r.spent), target: r.target === null ? null : centsFromDb(r.target), avg3: centsFromDb(r.avg3) }))
    .sort((a, b) => (b.spent > a.spent ? 1 : b.spent < a.spent ? -1 : a.name.localeCompare(b.name)));
}
