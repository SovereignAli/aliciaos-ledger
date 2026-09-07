import type { Sql } from "../db.ts";
import { centsFromDb } from "../money.ts";
import { resyncAllBuckets, syncBucketsForTxn } from "../buckets/index.ts";
import { classify, type RuleRow } from "./classify.ts";

export { classify, matchRule, categoryFromProvider, ilikeToRegex } from "./classify.ts";
export type { RuleRow, Classifiable, Classification } from "./classify.ts";

export interface CategoryContext {
  rules: RuleRow[];
  providerMap: Map<string, string>;
}

export async function loadCategoryContext(sql: Sql): Promise<CategoryContext> {
  const [rules, map] = await Promise.all([
    sql.query<RuleRow>(`select id, pattern, direction, account_id, category_id, priority from category_rule order by priority, pattern`),
    sql.query<{ plaid_detailed: string; category_id: string }>(`select plaid_detailed, category_id from plaid_category_map`),
  ]);
  return { rules, providerMap: new Map(map.map((m) => [m.plaid_detailed, m.category_id])) };
}

/**
 * Assign a category to one stored transaction unless Alex set it by hand.
 * Returns the category id written, or null if nothing matched.
 */
export async function categorizeTxn(sql: Sql, ctx: CategoryContext, txnId: string): Promise<string | null> {
  const [row] = await sql.query<{
    id: string; account_id: string; account_type: string; description: string; amount_cents: string; category: string | null;
    category_source: string | null; is_internal: boolean;
  }>(`select t.id, t.account_id, a.type as account_type, t.description, t.amount_cents::text, t.category, t.category_source, t.is_internal
        from txn t join account a on a.id = t.account_id where t.id = $1`, [txnId]);
  if (!row || row.category_source === "manual") return null;
  if (row.is_internal) {
    await sql.query(`update txn set category_id = 'internal_transfer', category_source = 'rule' where id = $1`, [row.id]);
    return "internal_transfer";
  }
  const result = classify(
    { description: row.description, amount: centsFromDb(row.amount_cents), accountId: row.account_id, accountType: row.account_type, providerCategory: row.category },
    ctx.rules,
    ctx.providerMap,
  );
  await sql.query(`update txn set category_id = $2, category_source = $3 where id = $1`, [row.id, result?.categoryId ?? null, result?.source ?? null]);
  return result?.categoryId ?? null;
}

/** Re-run rules over the rows a single new rule can touch, then keep their buckets in step. */
export async function recategorizeMatching(sql: Sql, pattern: string, direction: "in" | "out" | null): Promise<number> {
  const ctx = await loadCategoryContext(sql);
  const rows = await sql.query<{ id: string }>(
    `select id from txn where description ilike $1 and category_source is distinct from 'manual'
        and ($2::text is null or ($2 = 'out' and amount_cents < 0) or ($2 = 'in' and amount_cents > 0))`,
    [pattern, direction],
  );
  for (const r of rows) {
    await categorizeTxn(sql, ctx, r.id);
    await syncBucketsForTxn(sql, r.id, "system");
  }
  return rows.length;
}

/** Re-categorize just these rows and keep their buckets in step. */
export async function recategorizeIds(sql: Sql, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ctx = await loadCategoryContext(sql);
  for (const id of ids) {
    await categorizeTxn(sql, ctx, id);
    await syncBucketsForTxn(sql, id, "system");
  }
}

/** Re-run rules over everything not set by hand. Used after editing rules. */
export async function recategorizeAll(sql: Sql): Promise<{ total: number; categorized: number }> {
  const ctx = await loadCategoryContext(sql);
  const rows = await sql.query<{ id: string }>(`select id from txn where category_source is distinct from 'manual'`);
  let categorized = 0;
  for (const r of rows) if (await categorizeTxn(sql, ctx, r.id)) categorized++;
  await resyncAllBuckets(sql, "system");
  return { total: rows.length, categorized };
}
