import test from "node:test";
import assert from "node:assert/strict";
import { splitPaycheck } from "./split.ts";

test("splits sum exactly to gross; living takes the rounding remainder", () => {
  const s = splitPaycheck(199297n, { bufferPct: 10, investPct: 15 });
  assert.equal(s.buffer, 19929n); // 19929.7 floored
  assert.equal(s.invest, 29894n); // 29894.55 floored
  assert.equal(s.living, 199297n - 19929n - 29894n);
  assert.equal(s.buffer + s.invest + s.living, s.gross);
});

test("fractional percentages and edge cases", () => {
  assert.equal(splitPaycheck(10000n, { bufferPct: 33.33, investPct: 0 }).buffer, 3333n);
  assert.equal(splitPaycheck(1n, { bufferPct: 10, investPct: 15 }).living, 1n);
  assert.throws(() => splitPaycheck(0n, { bufferPct: 10, investPct: 0 }), RangeError);
  assert.throws(() => splitPaycheck(100n, { bufferPct: 70, investPct: 40 }), RangeError);
});
