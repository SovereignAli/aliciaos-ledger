import "server-only";
import { getSql } from "../db.ts";
import { centsFromDb, type Cents } from "../money.ts";
import { shortAccountName } from "../names.ts";

export interface HoldingView {
  id: string;
  accountId: string;
  accountName: string;
  subtype: string;
  ticker: string | null;
  name: string;
  type: string | null;
  quantity: string;
  price: Cents | null;
  value: Cents;
  costBasis: Cents | null;
  asOf: string;
}

export async function listHoldings(): Promise<HoldingView[]> {
  const rows = await getSql().query<{
    id: string; account_id: string; account_name: string; subtype: string; ticker: string | null; name: string; type: string | null;
    quantity: string; price: string | null; value: string; cost_basis: string | null; as_of: string;
  }>(
    `select h.id, a.id as account_id, a.name as account_name, a.subtype, s.ticker, s.name, s.type,
            h.quantity::text, h.institution_price_cents::text as price, h.institution_value_cents::text as value, h.cost_basis_cents::text as cost_basis, h.as_of::text
       from holding h join account a on a.id = h.account_id join security s on s.id = h.security_id
      where a.is_active and h.institution_value_cents >= 100
      order by h.institution_value_cents desc`,
  );
  return rows.map((r) => ({
    id: r.id, accountId: r.account_id, accountName: shortAccountName(r.account_name), subtype: r.subtype, ticker: r.ticker, name: r.name, type: r.type,
    quantity: r.quantity, price: r.price === null ? null : centsFromDb(r.price), value: centsFromDb(r.value), costBasis: r.cost_basis === null ? null : centsFromDb(r.cost_basis), asOf: r.as_of,
  }));
}

export interface InvestmentTxnView {
  id: string;
  accountName: string;
  postedAt: string;
  name: string;
  type: string;
  subtype: string | null;
  ticker: string | null;
  quantity: string;
  amount: Cents;
  price: Cents | null;
}

export async function listInvestmentTxns(limit = 200): Promise<InvestmentTxnView[]> {
  const rows = await getSql().query<{ id: string; account_name: string; posted_at: string; name: string; type: string; subtype: string | null; ticker: string | null; quantity: string; amount_cents: string; price_cents: string | null }>(
    `select t.id, a.name as account_name, t.posted_at::text, t.name, t.type, t.subtype, s.ticker, t.quantity::text, t.amount_cents::text, t.price_cents::text
       from investment_txn t join account a on a.id = t.account_id left join security s on s.id = t.security_id
      where a.is_active order by t.posted_at desc, t.created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ id: r.id, accountName: shortAccountName(r.account_name), postedAt: r.posted_at, name: r.name, type: r.type, subtype: r.subtype, ticker: r.ticker, quantity: r.quantity, amount: centsFromDb(r.amount_cents), price: r.price_cents === null ? null : centsFromDb(r.price_cents) }));
}

/** Dividends and interest paid inside investment accounts this year, plus cash contributions in. */
export async function investmentYear(year: number): Promise<{ dividends: Cents; contributions: Cents; fees: Cents }> {
  const [r] = await getSql().query<{ dividends: string; contributions: string; fees: string }>(
    `select coalesce(sum(t.amount_cents) filter (where t.subtype in ('dividend', 'interest', 'capital gain', 'long-term capital gain', 'short-term capital gain')), 0)::text as dividends,
            coalesce(sum(t.amount_cents) filter (where t.subtype in ('contribution', 'deposit') or (t.type = 'cash' and t.amount_cents > 0 and coalesce(t.subtype, '') not in ('dividend', 'interest'))), 0)::text as contributions,
            coalesce(sum(coalesce(t.fees_cents, 0)), 0)::text as fees
       from investment_txn t join account a on a.id = t.account_id
      where a.is_active and t.posted_at >= make_date($1, 1, 1) and t.posted_at < make_date($1 + 1, 1, 1)`,
    [year],
  );
  return { dividends: centsFromDb(r.dividends), contributions: centsFromDb(r.contributions), fees: centsFromDb(r.fees) };
}
