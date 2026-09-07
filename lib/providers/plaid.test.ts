import test from "node:test";
import assert from "node:assert/strict";
import { PlaidProvider, plaidAmountToCents, mapAccountSubtype, mapAccountType, normalizeInvestmentTxn, type PlaidClient } from "./plaid.ts";
import { ProviderAuthError, ProviderError } from "./errors.ts";
import type { Connection } from "./types.ts";

const conn: Connection = {
  institutionId: "00000000-0000-0000-0000-000000000001",
  provider: "plaid",
  externalId: "item-1",
  accessToken: "access-production-xyz",
  syncCursor: null,
};

// Shapes copied from the 2026-09-05 probe against the credit union.
const paypalPurchase = {
  transaction_id: "t1", account_id: "acc-chk", amount: 30.29, date: "2026-09-03", authorized_date: "2026-09-03",
  name: "ACH TRANS - PAYPAL ;090326;PURCHASE", merchant_name: null, pending: false, pending_transaction_id: null,
  personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER", confidence_level: "LOW" },
};
const incomingTransfer = {
  transaction_id: "t2", account_id: "acc-chk", amount: -500.0, date: "2026-09-01", authorized_date: null,
  name: "TRANSFER - SELF SERVICE TRANSFER FROM SHARE 01", merchant_name: null, pending: false, pending_transaction_id: null,
  personal_finance_category: null,
};

function fakeClient(pages: Array<Partial<{ added: unknown[]; modified: unknown[]; removed: unknown[]; next_cursor: string; has_more: boolean }>>, accounts: unknown[] = []): PlaidClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  let i = 0;
  return {
    calls,
    investmentsHoldingsGet: (async () => ({ data: { holdings: [], securities: [] } })) as never,
    investmentsTransactionsGet: (async () => ({ data: { investment_transactions: [], securities: [], total_investment_transactions: 0 } })) as never,
    accountsGet: (async () => ({ data: { accounts, item: { item_id: "item-1" }, request_id: "r" } })) as never,
    transactionsSync: (async (req: unknown) => {
      calls.push(req);
      const p = pages[i++] ?? {};
      return { data: { added: [], modified: [], removed: [], next_cursor: "c-end", has_more: false, ...p } };
    }) as never,
  };
}

test("sign convention: Plaid's positive outflow comes out negative", () => {
  assert.equal(plaidAmountToCents(30.29), -3029n);
  assert.equal(plaidAmountToCents(-500), 50000n);
  assert.equal(plaidAmountToCents(0), 0n);
  assert.equal(plaidAmountToCents(19.99), -1999n); // float rounding must not drop a cent
  assert.throws(() => plaidAmountToCents(NaN), RangeError);
});

test("a known debit from the probe comes out negative through the adapter", async () => {
  const p = new PlaidProvider(fakeClient([{ added: [paypalPurchase, incomingTransfer] }]));
  const changes = await p.fetchChanges(conn);
  assert.equal(changes.upserts.length, 2);
  assert.equal(changes.upserts[0].amount, -3029n);
  assert.equal(changes.upserts[0].externalId, "t1");
  assert.equal(changes.upserts[0].category, "GENERAL_MERCHANDISE_OTHER");
  assert.equal(changes.upserts[1].amount, 50000n);
  assert.equal(changes.upserts[1].category, null);
  assert.equal(changes.nextCursor, "c-end");
});

test("drains every page, carries the cursor, and collects removals", async () => {
  const client = fakeClient([
    { added: [paypalPurchase], next_cursor: "c1", has_more: true },
    { modified: [incomingTransfer], removed: [{ transaction_id: "t0", account_id: "acc-chk" }], next_cursor: "c2", has_more: false },
  ]);
  const p = new PlaidProvider(client);
  const changes = await p.fetchChanges({ ...conn, syncCursor: "c0" });
  assert.equal(changes.upserts.length, 2);
  assert.deepEqual(changes.removed, [{ externalId: "t0", accountExternalId: "acc-chk" }]);
  assert.equal(changes.nextCursor, "c2");
  assert.equal((client.calls[0] as { cursor: string }).cursor, "c0");
  assert.equal((client.calls[1] as { cursor: string }).cursor, "c1");
});

test("restarts from the original cursor on mutation-during-pagination", async () => {
  let n = 0;
  const client: PlaidClient = {
    investmentsHoldingsGet: (async () => ({ data: { holdings: [], securities: [] } })) as never,
    investmentsTransactionsGet: (async () => ({ data: { investment_transactions: [], securities: [], total_investment_transactions: 0 } })) as never,
    accountsGet: (async () => ({ data: { accounts: [] } })) as never,
    transactionsSync: (async (req: { cursor?: string }) => {
      n++;
      if (n === 2) throw { response: { data: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" } } };
      if (req.cursor === undefined || req.cursor === "") return { data: { added: [paypalPurchase], modified: [], removed: [], next_cursor: "c1", has_more: true } };
      return { data: { added: [incomingTransfer], modified: [], removed: [], next_cursor: "c2", has_more: false } };
    }) as never,
  };
  const changes = await new PlaidProvider(client).fetchChanges(conn);
  assert.equal(n, 4, "page1, fail, page1 again, page2");
  assert.equal(changes.upserts.length, 2, "no duplicates from the abandoned attempt");
});

test("ITEM_LOGIN_REQUIRED becomes a ProviderAuthError; anything else a ProviderError", async () => {
  const boom = (code: string): PlaidClient => ({
    investmentsHoldingsGet: (async () => { throw { response: { data: { error_code: code, error_message: "x" } } }; }) as never,
    investmentsTransactionsGet: (async () => { throw { response: { data: { error_code: code, error_message: "x" } } }; }) as never,
    accountsGet: (async () => { throw { response: { data: { error_code: code, error_message: "x" } } }; }) as never,
    transactionsSync: (async () => { throw { response: { data: { error_code: code, error_message: "x" } } }; }) as never,
  });
  await assert.rejects(new PlaidProvider(boom("ITEM_LOGIN_REQUIRED")).listAccounts(conn), ProviderAuthError);
  await assert.rejects(new PlaidProvider(boom("INTERNAL_SERVER_ERROR")).fetchChanges(conn), ProviderError);
});

test("accounts and balances normalize; balances keep their sign", async () => {
  const accounts = [
    { account_id: "acc-chk", name: "Share 00", official_name: "Regular Checking", mask: "1234", type: "depository", subtype: "checking",
      balances: { current: 1523.4, available: 1500, limit: null, iso_currency_code: "USD", unofficial_currency_code: null, last_updated_datetime: "2026-09-05T13:00:00Z" } },
    { account_id: "acc-ira", name: "Roth IRA", official_name: null, mask: null, type: "investment", subtype: "roth",
      balances: { current: 12000, available: null, limit: null, iso_currency_code: "USD", unofficial_currency_code: null, last_updated_datetime: null } },
    { account_id: "acc-cc", name: "Blue Cash", official_name: null, mask: "9",  type: "credit", subtype: "credit card",
      balances: { current: 210.5, available: null, limit: 5000, iso_currency_code: "USD", unofficial_currency_code: null } },
  ];
  const p = new PlaidProvider(fakeClient([], accounts));
  const accs = await p.listAccounts(conn);
  assert.deepEqual(accs.map((a) => [a.type, a.subtype, a.mask]), [["depository", "checking", "1234"], ["investment", "roth", null], ["credit", "other", "9"]]);
  const bals = await p.fetchBalances(conn);
  assert.equal(bals[0].current, 152340n);
  assert.equal(bals[0].available, 150000n);
  assert.equal(bals[0].asOf, "2026-09-05");
  assert.equal(bals[1].available, null);
  assert.match(bals[1].asOf, /^\d{4}-\d{2}-\d{2}$/);
});

test("type and subtype maps", () => {
  assert.equal(mapAccountType("brokerage"), "investment");
  assert.equal(mapAccountType("other"), "other");
  assert.equal(mapAccountSubtype("money market"), "savings");
  assert.equal(mapAccountSubtype("hsa"), "other");
  assert.equal(mapAccountSubtype(null), "other");
});

test("investment sign convention, from real Vanguard rows: a buy comes out negative, a dividend positive", () => {
  const buy = normalizeInvestmentTxn({ investment_transaction_id: "i1", account_id: "acc-ira", security_id: "s1", date: "2026-08-27", name: "BUY VTSAX", quantity: 1.234, amount: 160, price: 129.66, fees: 0, type: "buy", subtype: "buy", iso_currency_code: "USD", unofficial_currency_code: null } as never);
  assert.equal(buy.amount, -16000n);
  assert.equal(buy.price, 12966n);
  const div = normalizeInvestmentTxn({ investment_transaction_id: "i2", account_id: "acc-ira", security_id: "s1", date: "2026-06-30", name: "DIVIDEND", quantity: 0, amount: -12.34, price: 0, fees: 0, type: "cash", subtype: "dividend", iso_currency_code: "USD", unofficial_currency_code: null } as never);
  assert.equal(div.amount, 1234n);
  const contrib = normalizeInvestmentTxn({ investment_transaction_id: "i3", account_id: "acc-ira", security_id: null, date: "2026-08-26", name: "CONTRIBUTION", quantity: 0, amount: -160, price: 0, fees: 0, type: "cash", subtype: "contribution", iso_currency_code: "USD", unofficial_currency_code: null } as never);
  assert.equal(contrib.amount, 16000n);
});
