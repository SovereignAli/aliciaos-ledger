import type { Cents } from "../money.ts";

/**
 * The adapter boundary. Everything above it produces normalized rows;
 * everything below it consumes them and cannot tell where they came from.
 *
 * Manual entry is a provider, not a placeholder. Plaid implements this same
 * interface and nothing downstream changes.
 */

export type ProviderId = "manual" | "simplefin" | "plaid";

export type AccountType = "depository" | "investment" | "credit" | "loan" | "other";
export type AccountSubtype = "checking" | "savings" | "brokerage" | "ira" | "roth" | "hysa" | "other";

/** ISO calendar date, `YYYY-MM-DD`, in the account's local day. */
export type IsoDate = string;

export interface NormalizedAccount {
  /** Provider's id, or a stable synthetic one for manual (e.g. "gmefu-checking"). */
  externalId: string;
  name: string;
  officialName?: string | null;
  mask?: string | null;
  /** Annual percentage yield as a percent (4.0 = 4%), when the provider reports one. */
  apy?: number | null;
  type: AccountType;
  subtype: AccountSubtype;
  currency: "USD";
}

export interface NormalizedBalance {
  accountExternalId: string;
  asOf: IsoDate;
  current: Cents;
  available: Cents | null;
}

export interface NormalizedTxn {
  /** Null for manual — dedupe falls back to the hash. */
  externalId: string | null;
  accountExternalId: string;
  postedAt: IsoDate;
  /** NEGATIVE = money leaving the account. Always. Adapters normalize. */
  amount: Cents;
  description: string;
  pending: boolean;
  /** The provider's category hint. A rules table overrides it; never trust it as truth. */
  category?: string | null;
}

/** One page-set of incremental changes from a cursor-based provider. */
export interface TxnChanges {
  upserts: NormalizedTxn[];
  removed: Array<{ externalId: string; accountExternalId: string }>;
  /** Persist this only after the upserts and removals have landed. */
  nextCursor: string | null;
}

/**
 * One row of `institution`, with the access token already decrypted. Only
 * server code ever holds one of these.
 */
export interface Connection {
  institutionId: string;
  provider: ProviderId;
  externalId: string | null;
  accessToken: string | null;
  syncCursor: string | null;
}

export interface NormalizedSecurity {
  externalId: string;
  ticker: string | null;
  name: string;
  type: string | null;
  closePrice: Cents | null;
  closePriceAsOf: IsoDate | null;
}

export interface NormalizedHolding {
  accountExternalId: string;
  securityExternalId: string;
  quantity: string; // decimal string, shares
  institutionPrice: Cents | null;
  institutionValue: Cents;
  costBasis: Cents | null;
  asOf: IsoDate;
}

export interface NormalizedInvestmentTxn {
  externalId: string;
  accountExternalId: string;
  securityExternalId: string | null;
  postedAt: IsoDate;
  name: string;
  type: string;
  subtype: string | null;
  quantity: string;
  /** NEGATIVE = money leaving the account. A buy is negative, a sell or dividend positive. */
  amount: Cents;
  price: Cents | null;
  fees: Cents | null;
}

export interface AccountProvider {
  readonly id: ProviderId;
  listAccounts(conn: Connection): Promise<NormalizedAccount[]>;
  fetchBalances(conn: Connection): Promise<NormalizedBalance[]>;
  fetchTransactions(conn: Connection, since: IsoDate): Promise<NormalizedTxn[]>;
  /**
   * Incremental sync for providers with a cursor API. When present, ingest
   * prefers it over `fetchTransactions` and stores the returned cursor.
   */
  fetchChanges?(conn: Connection): Promise<TxnChanges>;
  /** Brokerage positions and their securities, when the provider has them for this connection. */
  fetchHoldings?(conn: Connection): Promise<{ securities: NormalizedSecurity[]; holdings: NormalizedHolding[] }>;
  /** Buys, sells, dividends and cash movements inside investment accounts since a date. */
  fetchInvestmentTransactions?(conn: Connection, since: IsoDate): Promise<{ securities: NormalizedSecurity[]; transactions: NormalizedInvestmentTxn[] }>;
}
