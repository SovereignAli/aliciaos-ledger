import test from "node:test";
import assert from "node:assert/strict";
import { ManualProvider } from "./manual.ts";
import type { Connection } from "./types.ts";

const conn: Connection = { institutionId: "00000000-0000-0000-0000-000000000001", provider: "manual", externalId: "manual", accessToken: null, syncCursor: null };

test("sign convention: a known debit comes out negative", async () => {
  const p = new ManualProvider({
    entries: [{ accountExternalId: "chk", postedAt: "2026-09-03", amount: "30.29", direction: "out", description: "ACH TRANS - PAYPAL ;090326;PURCHASE" }],
  });
  const [t] = await p.fetchTransactions(conn, "2026-01-01");
  assert.equal(t.amount, -3029n);
  assert.equal(t.externalId, null);
});

test("sign convention: money in is positive", async () => {
  const p = new ManualProvider({
    entries: [{ accountExternalId: "chk", postedAt: "2026-08-28", amount: "$1,850.00", direction: "in", description: " CCNY ACH PAYROLL " }],
  });
  const [t] = await p.fetchTransactions(conn, "2026-01-01");
  assert.equal(t.amount, 185000n);
  assert.equal(t.description, "CCNY ACH PAYROLL");
  assert.equal(t.pending, false);
});

test("rejects signed amounts and bad dates", async () => {
  await assert.rejects(new ManualProvider({ entries: [{ accountExternalId: "chk", postedAt: "2026-08-28", amount: "-5", direction: "out", description: "x" }] }).fetchTransactions(conn, "2026-01-01"));
  await assert.rejects(new ManualProvider({ entries: [{ accountExternalId: "chk", postedAt: "8/28/2026", amount: "5", direction: "out", description: "x" }] }).fetchTransactions(conn, "2026-01-01"), RangeError);
});

test("honours since", async () => {
  const p = new ManualProvider({
    entries: [
      { accountExternalId: "chk", postedAt: "2025-12-31", amount: "1", direction: "in", description: "old" },
      { accountExternalId: "chk", postedAt: "2026-01-01", amount: "1", direction: "in", description: "new" },
    ],
  });
  const ts = await p.fetchTransactions(conn, "2026-01-01");
  assert.deepEqual(ts.map((t) => t.description), ["new"]);
});

test("balances and accounts normalize", async () => {
  const p = new ManualProvider({
    accounts: [{ externalId: " amex-hysa ", name: " Amex HYSA ", type: "depository", subtype: "hysa" }],
    balances: [{ accountExternalId: "amex-hysa", asOf: "2026-09-05", current: "12,000.00", available: "" }],
  });
  assert.deepEqual(await p.listAccounts(conn), [{ externalId: "amex-hysa", name: "Amex HYSA", type: "depository", subtype: "hysa", currency: "USD" }]);
  assert.deepEqual(await p.fetchBalances(conn), [{ accountExternalId: "amex-hysa", asOf: "2026-09-05", current: 1200000n, available: null }]);
});
