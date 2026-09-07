import test from "node:test";
import assert from "node:assert/strict";
import { categoryFromProvider, classify, ilikeToRegex, matchRule, type RuleRow } from "./classify.ts";

const rules: RuleRow[] = [
  { id: "1", pattern: "%ACME CORP%PAYROLL%", direction: "in", account_id: null, category_id: "payroll", priority: 10 },
  { id: "2", pattern: "%FAMILY SHARE%", direction: null, account_id: null, category_id: "family_transfer", priority: 20 },
  { id: "3", pattern: "DIVIDEND", direction: "in", account_id: null, category_id: "dividends", priority: 30 },
  { id: "4", pattern: "%DISCOVER%", direction: "out", account_id: null, category_id: "credit_card_payment", priority: 40 },
  { id: "5", pattern: "%PAYPAL%", direction: null, account_id: null, category_id: "app_transfer", priority: 50 },
  { id: "6", pattern: "%PAYPAL%", direction: null, account_id: "acct-special", category_id: "gig_income", priority: 5 },
];
const map = new Map([["INCOME_DIVIDENDS", "dividends"], ["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "credit_card_payment"]]);
const base = { accountId: "acct-chk", providerCategory: null as string | null };

test("ILIKE semantics: case-insensitive, whole string, % and _ wildcards, literals escaped", () => {
  assert.ok(ilikeToRegex("DIVIDEND").test("dividend"));
  assert.ok(!ilikeToRegex("DIVIDEND").test("DIVIDEND REINVEST"));
  assert.ok(ilikeToRegex("%PAYPAL%").test("ACH TRANS - PAYPAL ;090326;PURCHASE"));
  assert.ok(ilikeToRegex("A_C").test("abc"));
  assert.ok(!ilikeToRegex("A.C").test("abc"));
  assert.ok(ilikeToRegex("%(x)%").test("foo (x) bar"));
});

test("payroll rule catches the real ACH string and respects direction", () => {
  const desc = "ACH TRANS - ACME CORP,090126,PAYROLL";
  assert.equal(matchRule(rules, { ...base, description: desc, amount: 199297n })?.category_id, "payroll");
  assert.equal(matchRule(rules, { ...base, description: desc, amount: -199297n }), null, "an outflow with that text is not payroll");
});

test("priority wins, then account scope narrows", () => {
  assert.equal(matchRule(rules, { ...base, description: "ACH TRANS - PAYPAL ;1;PURCHASE", amount: -3029n })?.category_id, "app_transfer");
  assert.equal(matchRule(rules, { ...base, accountId: "acct-special", description: "PAYPAL", amount: 100n })?.category_id, "gig_income");
  assert.equal(matchRule(rules, { ...base, description: "DIVIDEND", amount: 17n })?.category_id, "dividends");
  assert.equal(matchRule(rules, { ...base, description: "ACH TRANS - DISCOVER  E-PAYMENT", amount: -20000n })?.category_id, "credit_card_payment");
});

test("provider mapping: explicit detailed first, then primary fallback, then null", () => {
  assert.equal(categoryFromProvider("INCOME_DIVIDENDS", map), "dividends");
  assert.equal(categoryFromProvider("INCOME_SALARY", map), "gig_income");
  assert.equal(categoryFromProvider("TRANSFER_IN_WIRE", map), "other_transfer");
  assert.equal(categoryFromProvider("FOOD_AND_DRINK_RESTAURANT", map), "food_and_drink");
  assert.equal(categoryFromProvider("GENERAL_MERCHANDISE_OTHER", map), "shopping");
  assert.equal(categoryFromProvider("SOMETHING_NEW", map), null);
  assert.equal(categoryFromProvider(null, map), null);
});

test("classify: rule beats provider; provider fills in; nothing → null", () => {
  assert.deepEqual(classify({ ...base, description: "DIVIDEND", amount: 17n, providerCategory: "INCOME_INTEREST_EARNED" }, rules, map), { categoryId: "dividends", source: "rule" });
  assert.deepEqual(classify({ ...base, description: "STARBUCKS", amount: -500n, providerCategory: "FOOD_AND_DRINK_COFFEE" }, rules, map), { categoryId: "food_and_drink", source: "provider" });
  assert.equal(classify({ ...base, description: "MYSTERY", amount: -500n }, rules, map), null);
});

test("an inflow on a credit card is a payment unless it is a refund", () => {
  assert.deepEqual(classify({ ...base, accountType: "credit", description: "DIRECTPAY FULL BALANCE", amount: 69163n, providerCategory: "INCOME_CONTRACTOR" }, [], map), { categoryId: "credit_card_payment", source: "provider" });
  assert.deepEqual(classify({ ...base, accountType: "credit", description: "AMAZON.COM", amount: 10729n, providerCategory: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES" }, [], map), { categoryId: "shopping", source: "provider" });
  assert.deepEqual(classify({ ...base, accountType: "depository", description: "SOMETHING", amount: 500n, providerCategory: "INCOME_CONTRACTOR" }, [], map), { categoryId: "gig_income", source: "provider" });
});
