import test from "node:test";
import assert from "node:assert/strict";
import { isTransferPair, pickPartner, type TransferCandidate } from "./transfers.ts";

const base: TransferCandidate = { id: "a", accountId: "chk", postedAt: "2026-08-29", amountCents: -46250n, transferGroupId: null, isInternalManual: false };
const mk = (o: Partial<TransferCandidate>): TransferCandidate => ({ ...base, ...o });

test("pairs opposite amounts in different accounts within 3 days", () => {
  assert.ok(isTransferPair(base, mk({ id: "b", accountId: "sav", amountCents: 46250n, postedAt: "2026-09-01" })));
  assert.ok(!isTransferPair(base, mk({ id: "b", accountId: "sav", amountCents: 46250n, postedAt: "2026-09-02" })), "4 days");
  assert.ok(!isTransferPair(base, mk({ id: "b", accountId: "chk", amountCents: 46250n })), "same account");
  assert.ok(!isTransferPair(base, mk({ id: "b", accountId: "sav", amountCents: 46200n })), "unequal");
  assert.ok(!isTransferPair(base, mk({ id: "b", accountId: "sav", amountCents: -46250n })), "same sign");
  assert.ok(!isTransferPair(base, mk({ id: "b", accountId: "sav", amountCents: 46250n, transferGroupId: "g" })), "already paired");
  assert.ok(!isTransferPair(base, mk({ id: "b", accountId: "sav", amountCents: 46250n, isInternalManual: true })), "manual override wins");
  assert.ok(!isTransferPair(mk({ amountCents: 0n }), mk({ id: "b", accountId: "sav", amountCents: 0n })), "zero never pairs");
});

test("pickPartner prefers the closest date, then lowest id", () => {
  const far = mk({ id: "far", accountId: "sav", amountCents: 46250n, postedAt: "2026-09-01" });
  const near = mk({ id: "near", accountId: "sav", amountCents: 46250n, postedAt: "2026-08-30" });
  const near2 = mk({ id: "aaa", accountId: "hysa", amountCents: 46250n, postedAt: "2026-08-30" });
  assert.equal(pickPartner(base, [far, near])?.id, "near");
  assert.equal(pickPartner(base, [near, near2])?.id, "aaa");
  assert.equal(pickPartner(base, [mk({ id: "x", accountId: "sav", amountCents: 1n })]), null);
});
