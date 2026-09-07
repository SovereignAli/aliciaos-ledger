import type { AccountBase, InvestmentTransaction, PlaidApi, Security, Transaction, TransactionsSyncResponse } from "plaid";
import type { Cents } from "../money.ts";
import { ProviderAuthError, ProviderError } from "./errors.ts";
import type {
  AccountProvider,
  AccountSubtype,
  AccountType,
  Connection,
  IsoDate,
  NormalizedAccount,
  NormalizedBalance,
  NormalizedInvestmentTxn,
  NormalizedSecurity,
  NormalizedTxn,
  TxnChanges,
} from "./types.ts";

/**
 * Plaid adapter. Confirmed against real data on 2026-09-05:
 *   - Plaid is POSITIVE for money leaving the account. We are negative. Invert here.
 *   - Use /accounts/get (cached) for routine display; /accounts/balance/get forces a
 *     live round trip and fell over at the credit union within the hour.
 *   - The credit union connects by credentials and will throw ITEM_LOGIN_REQUIRED
 *     periodically; that becomes a ProviderAuthError and institution.status = needs_reauth.
 */

/** The slice of the SDK this adapter needs, so tests can hand in a fake. */
export type PlaidClient = Pick<PlaidApi, "accountsGet" | "transactionsSync" | "investmentsHoldingsGet" | "investmentsTransactionsGet">;

const SYNC_PAGE = 500;
const MAX_MUTATION_RESTARTS = 3;

/** Plaid amounts are decimal dollars as a float. Round to cents, then flip the sign. */
export function plaidAmountToCents(amount: number): Cents {
  if (!Number.isFinite(amount)) throw new RangeError(`Bad Plaid amount: ${amount}`);
  const cents = Math.round(amount * 100);
  return BigInt(cents === 0 ? 0 : -cents);
}

export function mapAccountType(type: string): AccountType {
  switch (type) {
    case "depository":
    case "investment":
    case "credit":
    case "loan":
      return type;
    case "brokerage":
      return "investment";
    default:
      return "other";
  }
}

export function mapAccountSubtype(subtype: string | null | undefined): AccountSubtype {
  switch (subtype) {
    case "checking":
      return "checking";
    case "savings":
    case "money market":
      return "savings";
    case "brokerage":
      return "brokerage";
    case "ira":
    case "sep ira":
    case "simple ira":
      return "ira";
    case "roth":
    case "roth 401k":
      return "roth";
    default:
      return "other";
  }
}

function todayInNewYork(): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function requireToken(conn: Connection): string {
  if (!conn.accessToken) throw new ProviderError("NO_ACCESS_TOKEN", "Plaid connection has no access token");
  return conn.accessToken;
}

/** Turn an axios/Plaid failure into one of our two error types. */
export function translatePlaidError(err: unknown): never {
  const data = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
  const code = data?.error_code ?? "UNKNOWN";
  const message = data?.error_message ?? (err instanceof Error ? err.message : String(err));
  if (code === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION" || code === "USER_PERMISSION_REVOKED") {
    throw new ProviderAuthError(code, message);
  }
  throw new ProviderError(code, message);
}

export function normalizeAccount(a: AccountBase): NormalizedAccount {
  return {
    externalId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    mask: a.mask ?? null,
    apy: typeof a.apy === "number" ? a.apy : null,
    type: mapAccountType(a.type),
    subtype: mapAccountSubtype(a.subtype),
    currency: "USD",
  };
}

/** Prices and values are plain dollars, not flows: round to cents, keep the sign. */
export function dollarsToCents(v: number | null | undefined): Cents | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return BigInt(Math.round(v * 100));
}

export function normalizeSecurity(s: Security): NormalizedSecurity {
  return {
    externalId: s.security_id,
    ticker: s.ticker_symbol ?? null,
    name: s.name ?? s.ticker_symbol ?? "Unknown security",
    type: s.type ?? null,
    closePrice: dollarsToCents(s.close_price),
    closePriceAsOf: s.close_price_as_of ?? null,
  };
}

/**
 * Investment amounts follow Plaid's usual convention, confirmed against real
 * Vanguard rows on 2026-09-06: a buy is POSITIVE (cash leaves), a contribution
 * or dividend NEGATIVE (cash arrives). Flip, same as the transactions product.
 */
export function normalizeInvestmentTxn(t: InvestmentTransaction): NormalizedInvestmentTxn {
  return {
    externalId: t.investment_transaction_id,
    accountExternalId: t.account_id,
    securityExternalId: t.security_id ?? null,
    postedAt: t.date,
    name: t.name,
    type: String(t.type),
    subtype: t.subtype ? String(t.subtype) : null,
    quantity: String(t.quantity ?? 0),
    amount: plaidAmountToCents(t.amount ?? 0),
    price: dollarsToCents(t.price),
    fees: dollarsToCents(t.fees),
  };
}

export function normalizeTxn(t: Transaction): NormalizedTxn {
  return {
    externalId: t.transaction_id,
    accountExternalId: t.account_id,
    postedAt: t.date,
    amount: plaidAmountToCents(t.amount),
    description: t.name,
    pending: t.pending,
    category: t.personal_finance_category?.detailed ?? t.personal_finance_category?.primary ?? null,
  };
}

export class PlaidProvider implements AccountProvider {
  readonly id = "plaid" as const;
  readonly #client: PlaidClient;

  constructor(client: PlaidClient) {
    this.#client = client;
  }

  async listAccounts(conn: Connection): Promise<NormalizedAccount[]> {
    const accounts = await this.#accounts(conn);
    return accounts.map(normalizeAccount);
  }

  async fetchBalances(conn: Connection): Promise<NormalizedBalance[]> {
    const accounts = await this.#accounts(conn);
    const today = todayInNewYork();
    return accounts
      .filter((a) => a.balances.current !== null)
      .map((a) => ({
        accountExternalId: a.account_id,
        asOf: a.balances.last_updated_datetime ? a.balances.last_updated_datetime.slice(0, 10) : today,
        // A balance is money in the account, not a flow, so no sign flip.
        current: -plaidAmountToCents(a.balances.current as number),
        available: a.balances.available === null ? null : -plaidAmountToCents(a.balances.available),
      }));
  }

  /** Full pull from the beginning of the Item's history. Prefer fetchChanges. */
  async fetchTransactions(conn: Connection, since: IsoDate): Promise<NormalizedTxn[]> {
    const changes = await this.#drain(requireToken(conn), "");
    return changes.upserts.filter((t) => t.postedAt >= since);
  }

  async fetchChanges(conn: Connection): Promise<TxnChanges> {
    return this.#drain(requireToken(conn), conn.syncCursor ?? "");
  }

  async fetchHoldings(conn: Connection) {
    try {
      const res = await this.#client.investmentsHoldingsGet({ access_token: requireToken(conn) });
      return {
        securities: res.data.securities.map(normalizeSecurity),
        holdings: res.data.holdings.map((h) => ({
          accountExternalId: h.account_id,
          securityExternalId: h.security_id,
          quantity: String(h.quantity),
          institutionPrice: dollarsToCents(h.institution_price),
          institutionValue: dollarsToCents(h.institution_value) ?? 0n,
          costBasis: dollarsToCents(h.cost_basis),
          asOf: h.institution_price_as_of ?? todayInNewYork(),
        })),
      };
    } catch (err) {
      translatePlaidError(err);
    }
  }

  async fetchInvestmentTransactions(conn: Connection, since: IsoDate) {
    const token = requireToken(conn);
    const end = todayInNewYork();
    const start = since < "2000-01-01" ? "2000-01-01" : since;
    const securities = new Map<string, NormalizedSecurity>();
    const transactions: NormalizedInvestmentTxn[] = [];
    let offset = 0;
    try {
      for (;;) {
        const res = await this.#client.investmentsTransactionsGet({ access_token: token, start_date: start, end_date: end, options: { count: 500, offset } });
        for (const s of res.data.securities) securities.set(s.security_id, normalizeSecurity(s));
        for (const t of res.data.investment_transactions) transactions.push(normalizeInvestmentTxn(t));
        offset += res.data.investment_transactions.length;
        if (offset >= res.data.total_investment_transactions || res.data.investment_transactions.length === 0) break;
      }
    } catch (err) {
      translatePlaidError(err);
    }
    return { securities: [...securities.values()], transactions };
  }

  async #accounts(conn: Connection): Promise<AccountBase[]> {
    try {
      const res = await this.#client.accountsGet({ access_token: requireToken(conn) });
      return res.data.accounts;
    } catch (err) {
      translatePlaidError(err);
    }
  }

  /**
   * Walk /transactions/sync to the end. Plaid's rule: if the Item mutates
   * mid-pagination, restart from the cursor you began with, not the page
   * that failed.
   */
  async #drain(accessToken: string, startCursor: string): Promise<TxnChanges> {
    for (let attempt = 0; ; attempt++) {
      const upserts: NormalizedTxn[] = [];
      const removed: TxnChanges["removed"] = [];
      let cursor = startCursor;
      let hasMore = true;
      try {
        while (hasMore) {
          const res = await this.#client.transactionsSync({
            access_token: accessToken,
            cursor: cursor || undefined,
            count: SYNC_PAGE,
            options: { include_original_description: true },
          });
          const page: TransactionsSyncResponse = res.data;
          for (const t of page.added) upserts.push(normalizeTxn(t));
          for (const t of page.modified) upserts.push(normalizeTxn(t));
          for (const r of page.removed) removed.push({ externalId: r.transaction_id, accountExternalId: r.account_id });
          cursor = page.next_cursor;
          hasMore = page.has_more;
        }
        return { upserts, removed, nextCursor: cursor };
      } catch (err) {
        const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
        if (code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt < MAX_MUTATION_RESTARTS) continue;
        translatePlaidError(err);
      }
    }
  }
}
