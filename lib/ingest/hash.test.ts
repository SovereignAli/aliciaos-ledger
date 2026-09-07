import test from "node:test";
import assert from "node:assert/strict";
import { dedupeHash } from "./hash.ts";

test("dedupe hash is case- and whitespace-insensitive on description only", () => {
  const a = dedupeHash("acct", "2026-08-28", 185000n, "ACME ACH PAYROLL");
  const b = dedupeHash("acct", "2026-08-28", 185000n, "  acme ach payroll ");
  assert.ok(a.equals(b));
  assert.equal(a.length, 32);
  assert.ok(!a.equals(dedupeHash("acct", "2026-08-29", 185000n, "ACME ACH PAYROLL")));
  assert.ok(!a.equals(dedupeHash("acct", "2026-08-28", 185001n, "ACME ACH PAYROLL")));
  assert.ok(!a.equals(dedupeHash("acct2", "2026-08-28", 185000n, "ACME ACH PAYROLL")));
  assert.ok(!a.equals(dedupeHash("acct", "2026-08-28", -185000n, "ACME ACH PAYROLL")));
});
