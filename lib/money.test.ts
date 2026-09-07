import test from "node:test";
import assert from "node:assert/strict";
import { centsFromDb, formatCents, parseDollarsToCents } from "./money.ts";

test("parseDollarsToCents is exact and never floats", () => {
  assert.equal(parseDollarsToCents("1,250.50"), 125050n);
  assert.equal(parseDollarsToCents("$30"), 3000n);
  assert.equal(parseDollarsToCents("30.29"), 3029n);
  assert.equal(parseDollarsToCents("-12.05"), -1205n);
  assert.equal(parseDollarsToCents(".5"), 50n);
  assert.equal(parseDollarsToCents("0.1"), 10n);
  assert.equal(parseDollarsToCents("19.99"), 1999n); // 19.99 * 100 is 1998.9999 as a float
});

test("parseDollarsToCents rejects ambiguity", () => {
  for (const bad of ["", "abc", "1.234", "1..2", "1,2,3.4.5", "$"]) {
    assert.throws(() => parseDollarsToCents(bad), RangeError, bad);
  }
});

test("formatCents", () => {
  assert.equal(formatCents(125050n), "$1,250.50");
  assert.equal(formatCents(-1205n), "−$12.05");
  assert.equal(formatCents(0n), "$0.00");
  assert.equal(formatCents(5n), "$0.05");
  assert.equal(formatCents(185000n, { sign: "always" }), "+$1,850.00");
  assert.equal(formatCents(-185000n, { sign: "never" }), "$1,850.00");
});

test("centsFromDb converts driver strings exactly", () => {
  assert.equal(centsFromDb("9007199254740993"), 9007199254740993n);
  assert.equal(centsFromDb("-46250"), -46250n);
  assert.equal(centsFromDb(100), 100n);
  assert.throws(() => centsFromDb("12.5"), RangeError);
  assert.throws(() => centsFromDb(2 ** 53), RangeError);
});
