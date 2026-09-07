import type { Cents } from "../money.ts";

/**
 * Categorization. Order of authority:
 *   1. manual — Alex set it; never touched again
 *   2. rule   — the editable pattern table, lowest priority number wins
 *   3. provider — Plaid's detailed personal_finance_category mapped onto ours
 * Internal transfer pairing sets 'internal_transfer' directly.
 */

export interface RuleRow {
  id: string;
  pattern: string; // SQL ILIKE pattern
  direction: "in" | "out" | null;
  account_id: string | null;
  category_id: string;
  priority: number;
}

export interface Classifiable {
  description: string;
  amount: Cents;
  accountId: string;
  accountType?: string; // 'depository' | 'credit' | ...
  providerCategory: string | null; // Plaid detailed, e.g. INCOME_DIVIDENDS
}

const SPENDING_IDS = new Set(["food_and_drink", "groceries", "shopping", "entertainment", "transportation", "travel", "rent_and_utilities", "home", "medical", "personal_care", "services", "government", "bank_fees", "gear", "other_spending"]);

export interface Classification {
  categoryId: string;
  source: "rule" | "provider";
}

/** Compile an ILIKE pattern to a case-insensitive, whole-string regex. */
export function ilikeToRegex(pattern: string): RegExp {
  let out = "^";
  for (const ch of pattern) {
    if (ch === "%") out += ".*";
    else if (ch === "_") out += ".";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(out + "$", "is");
}

const compiled = new WeakMap<RuleRow, RegExp>();
function regexFor(rule: RuleRow): RegExp {
  let re = compiled.get(rule);
  if (!re) {
    re = ilikeToRegex(rule.pattern);
    compiled.set(rule, re);
  }
  return re;
}

export function matchRule(rules: RuleRow[], txn: Classifiable): RuleRow | null {
  const direction = txn.amount < 0n ? "out" : "in";
  const candidates = rules
    .filter((r) => (r.direction === null || r.direction === direction) && (r.account_id === null || r.account_id === txn.accountId))
    .sort((a, b) => a.priority - b.priority || a.pattern.localeCompare(b.pattern));
  for (const r of candidates) {
    if (regexFor(r).test(txn.description)) return r;
  }
  return null;
}

/** Fallback by Plaid primary when the detailed value has no explicit mapping. */
const PRIMARY_FALLBACK: Record<string, string> = {
  INCOME: "gig_income",
  TRANSFER_IN: "other_transfer",
  TRANSFER_OUT: "other_transfer",
  LOAN_PAYMENTS: "loan_payment",
  LOAN_DISBURSEMENTS: "other_transfer",
  BANK_FEES: "bank_fees",
  ENTERTAINMENT: "entertainment",
  FOOD_AND_DRINK: "food_and_drink",
  GENERAL_MERCHANDISE: "shopping",
  HOME_IMPROVEMENT: "home",
  MEDICAL: "medical",
  PERSONAL_CARE: "personal_care",
  GENERAL_SERVICES: "services",
  GOVERNMENT_AND_NON_PROFIT: "government",
  TRANSPORTATION: "transportation",
  TRAVEL: "travel",
  RENT_AND_UTILITIES: "rent_and_utilities",
  OTHER: "other_spending",
};

export function categoryFromProvider(detailed: string | null, map: Map<string, string>): string | null {
  if (!detailed) return null;
  const explicit = map.get(detailed);
  if (explicit) return explicit;
  // Longest primary that prefixes the detailed value (TRANSFER_IN vs TRANSFER_IN_...).
  const primary = Object.keys(PRIMARY_FALLBACK)
    .filter((p) => detailed === p || detailed.startsWith(p + "_"))
    .sort((a, b) => b.length - a.length)[0];
  return primary ? PRIMARY_FALLBACK[primary] : null;
}

export function classify(txn: Classifiable, rules: RuleRow[], providerMap: Map<string, string>): Classification | null {
  const rule = matchRule(rules, txn);
  if (rule) return { categoryId: rule.category_id, source: "rule" };
  const fromProvider = categoryFromProvider(txn.providerCategory, providerMap);
  // Money arriving on a credit card is a payment to it, unless the provider says it's a refund of spending.
  if (txn.accountType === "credit" && txn.amount > 0n && !(fromProvider && SPENDING_IDS.has(fromProvider))) {
    return { categoryId: "credit_card_payment", source: "provider" };
  }
  return fromProvider ? { categoryId: fromProvider, source: "provider" } : null;
}
