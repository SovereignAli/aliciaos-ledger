import { parseDollarsToCents } from "../money.ts";
import type {
  AccountProvider,
  AccountSubtype,
  AccountType,
  Connection,
  IsoDate,
  NormalizedAccount,
  NormalizedBalance,
  NormalizedTxn,
} from "./types.ts";

/**
 * Raw input as a human types it: dollars as a string, direction as a word.
 * The adapter is what turns this into cents with the right sign, exactly the
 * way the Plaid adapter will turn Plaid's positive-for-outflow into ours.
 */
export interface ManualAccountInput {
  externalId: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
}

export interface ManualBalanceInput {
  accountExternalId: string;
  asOf: IsoDate;
  current: string;
  available?: string | null;
}

export interface ManualEntryInput {
  accountExternalId: string;
  postedAt: IsoDate;
  /** Unsigned dollars, e.g. "1,250.00". Sign comes from `direction`. */
  amount: string;
  direction: "in" | "out";
  description: string;
  pending?: boolean;
}

export interface ManualBatch {
  accounts?: ManualAccountInput[];
  balances?: ManualBalanceInput[];
  entries?: ManualEntryInput[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, field = "date"): IsoDate {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new RangeError(`${field} must be YYYY-MM-DD, got "${value}"`);
  }
  return value;
}

/**
 * The manual provider. A `ManualBatch` is what Alex just typed (or a CSV
 * export); the provider normalizes it and the shared ingest path stores it.
 */
export class ManualProvider implements AccountProvider {
  readonly id = "manual" as const;
  readonly #batch: ManualBatch;

  constructor(batch: ManualBatch) {
    this.#batch = batch;
  }

  async listAccounts(conn: Connection): Promise<NormalizedAccount[]> {
    void conn;
    return (this.#batch.accounts ?? []).map((a) => ({
      externalId: a.externalId.trim(),
      name: a.name.trim(),
      type: a.type,
      subtype: a.subtype,
      currency: "USD",
    }));
  }

  async fetchBalances(conn: Connection): Promise<NormalizedBalance[]> {
    void conn;
    return (this.#batch.balances ?? []).map((b) => ({
      accountExternalId: b.accountExternalId,
      asOf: assertIsoDate(b.asOf, "asOf"),
      current: parseDollarsToCents(b.current),
      available: b.available == null || b.available === "" ? null : parseDollarsToCents(b.available),
    }));
  }

  async fetchTransactions(conn: Connection, since: IsoDate): Promise<NormalizedTxn[]> {
    void conn;
    return (this.#batch.entries ?? [])
      .map((e) => {
        const magnitude = parseDollarsToCents(e.amount);
        if (magnitude < 0n) throw new RangeError("Manual amounts are unsigned; use direction for in/out");
        const amount = e.direction === "out" ? -magnitude : magnitude;
        return {
          externalId: null,
          accountExternalId: e.accountExternalId,
          postedAt: assertIsoDate(e.postedAt, "postedAt"),
          amount,
          description: e.description.trim(),
          pending: e.pending ?? false,
        };
      })
      .filter((t) => t.postedAt >= since);
  }
}
