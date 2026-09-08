"use server";

import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUserId } from "@/lib/auth";
import { resyncAllBuckets, syncBucketsForTxn } from "@/lib/buckets";
import { recategorizeIds, recategorizeMatching } from "@/lib/categories";
import { getSql } from "@/lib/db";
import { parseDollarsToCents } from "@/lib/money";
import { requestIp } from "@/lib/request";

const ROLES = ["cash", "long_term_savings", "investment", "credit", "other"] as const;

function revalidateAll() {
  for (const p of ["/", "/cash", "/savings", "/investments", "/transactions", "/budgets", "/income"]) revalidatePath(p);
}

/** Alex's category choice is authoritative. Optionally it becomes a rule for everything that looks like it. */
export async function setTxnCategory(txnId: string, categoryId: string, makeRule: boolean): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireUserId();
  const sql = getSql();
  const [before] = await sql.query<{ description: string; category_id: string | null; amount_cents: string; is_internal: boolean; transfer_group_id: string | null }>(
    `select description, category_id, amount_cents::text, is_internal, transfer_group_id from txn where id = $1`,
    [txnId],
  );
  if (!before) return { ok: false, message: "No such transaction." };
  const [cat] = await sql.query<{ id: string }>(`select id from category where id = $1`, [categoryId]);
  if (!cat) return { ok: false, message: "No such category." };

  let partner: string[] = [];
  if (before.is_internal && categoryId !== "internal_transfer") {
    // Alex says this leg is a real transaction: release its partner and stop re-pairing either.
    if (before.transfer_group_id) {
      partner = (await sql.query<{ id: string }>(
        `update txn set is_internal = false, transfer_group_id = null where transfer_group_id = $1 and id <> $2 and is_internal_manual = false returning id`,
        [before.transfer_group_id, txnId],
      )).map((r) => r.id);
    }
    await sql.query(`update txn set is_internal = false, is_internal_manual = true, transfer_group_id = null where id = $1`, [txnId]);
  }
  await sql.query(`update txn set category_id = $2, category_source = 'manual', updated_at = now() where id = $1`, [txnId, categoryId]);
  await recategorizeIds(sql, partner);
  await syncBucketsForTxn(sql, txnId, userId);
  await writeAudit(sql, {
    actor: userId, action: "txn.category", entity: "txn", entityId: txnId,
    before: { category_id: before.category_id }, after: { category_id: categoryId, source: "manual" }, ip: await requestIp(),
  });

  if (makeRule) {
    // Exact description, escaped for ILIKE, scoped by direction. Beats every seeded rule.
    const pattern = before.description.replace(/[\\%_]/g, (c) => "\\" + c);
    const direction = before.amount_cents.startsWith("-") ? "out" : "in";
    const [rule] = await sql.query<{ id: string }>(
      `insert into category_rule (pattern, direction, category_id, priority, note) values ($1, $2, $3, 5, 'Made from a transaction') returning id`,
      [pattern, direction, categoryId],
    );
    await writeAudit(sql, { actor: userId, action: "category_rule.insert", entity: "category_rule", entityId: rule.id, after: { pattern, direction, categoryId } });
    await recategorizeMatching(sql, pattern, direction);
  }
  revalidateAll();
  return { ok: true };
}

/** A manual internal/external correction is authoritative and is never re-paired. */
export async function setTxnInternal(txnId: string, isInternal: boolean): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const sql = getSql();
  const [before] = await sql.query<{ is_internal: boolean; transfer_group_id: string | null }>(`select is_internal, transfer_group_id from txn where id = $1`, [txnId]);
  if (!before) return { ok: false };
  if (isInternal) {
    await sql.query(
      `update txn set is_internal = true, is_internal_manual = true, category_id = 'internal_transfer', category_source = 'manual', updated_at = now() where id = $1`,
      [txnId],
    );
  } else {
    // Detach the partner too, so it doesn't stay half of a pair.
    let partner: string[] = [];
    if (before.transfer_group_id) {
      partner = (await sql.query<{ id: string }>(`update txn set is_internal = false, transfer_group_id = null where transfer_group_id = $1 and id <> $2 and is_internal_manual = false returning id`, [before.transfer_group_id, txnId])).map((r) => r.id);
    }
    await sql.query(
      `update txn set is_internal = false, is_internal_manual = true, transfer_group_id = null,
              category_id = case when category_id = 'internal_transfer' then null else category_id end,
              category_source = case when category_id = 'internal_transfer' then null else category_source end,
              updated_at = now()
        where id = $1`,
      [txnId],
    );
    await recategorizeIds(sql, [txnId, ...partner]);
  }
  await syncBucketsForTxn(sql, txnId, userId);
  await writeAudit(sql, { actor: userId, action: "txn.internal", entity: "txn", entityId: txnId, before, after: { is_internal: isInternal, manual: true }, ip: await requestIp() });
  revalidateAll();
  return { ok: true };
}

export async function setAccountRole(accountId: string, role: string): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false };
  const sql = getSql();
  const [before] = await sql.query<{ role: string }>(`select role from account where id = $1`, [accountId]);
  if (!before) return { ok: false };
  await sql.query(`update account set role = $2 where id = $1`, [accountId, role]);
  await writeAudit(sql, { actor: userId, action: "account.role", entity: "account", entityId: accountId, before, after: { role }, ip: await requestIp() });
  revalidateAll();
  return { ok: true };
}

export async function setBudgetTarget(categoryId: string, month: string, dollars: string): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireUserId();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  let cents: bigint;
  try {
    cents = dollars.trim() === "" ? 0n : parseDollarsToCents(dollars);
  } catch {
    return { ok: false, message: "Enter dollars and cents." };
  }
  if (cents < 0n) return { ok: false, message: "Targets can't be negative." };
  const sql = getSql();
  const effectiveFrom = `${month}-01`;
  await sql.query(
    `insert into budget_target (category_id, effective_from, target_cents) values ($1, $2, $3)
     on conflict (category_id, effective_from) do update set target_cents = excluded.target_cents`,
    [categoryId, effectiveFrom, cents.toString()],
  );
  await writeAudit(sql, { actor: userId, action: "budget_target.set", entity: "budget_target", entityId: `${categoryId}@${effectiveFrom}`, after: { target_cents: cents }, ip: await requestIp() });
  revalidatePath("/budgets");
  return { ok: true };
}

/** Hide an account from every view and total. Nothing is deleted; history stays. */
export async function setAccountHidden(accountId: string, hidden: boolean): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const sql = getSql();
  const [before] = await sql.query<{ is_active: boolean }>(`select is_active from account where id = $1`, [accountId]);
  if (!before) return { ok: false };
  await sql.query(`update account set is_active = $2 where id = $1`, [accountId, !hidden]);
  await writeAudit(sql, { actor: userId, action: "account.hidden", entity: "account", entityId: accountId, before, after: { is_active: !hidden }, ip: await requestIp() });
  revalidateAll();
  return { ok: true };
}

/** Change the split going forward. Past paychecks keep the policy they were split under. */
export async function setSplitPolicy(bufferPct: string, investPct: string, effectiveFrom: string): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireUserId();
  const pcts = [bufferPct, investPct].map((v) => Number(v));
  if (pcts.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) return { ok: false, message: "Percentages must be between 0 and 100." };
  if (pcts[0] + pcts[1] > 100) return { ok: false, message: "The two slices add up to more than 100%." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return { ok: false, message: "Bad date." };
  const sql = getSql();
  const [row] = await sql.query<{ id: string }>(
    `insert into split_policy (effective_from, buffer_pct, invest_pct) values ($1, $2, $3)
     on conflict (effective_from) do update set buffer_pct = excluded.buffer_pct, invest_pct = excluded.invest_pct
     returning id`,
    [effectiveFrom, pcts[0], pcts[1]],
  );
  await writeAudit(sql, { actor: userId, action: "split_policy.set", entity: "split_policy", entityId: row.id, after: { effectiveFrom, bufferPct: pcts[0], investPct: pcts[1] }, ip: await requestIp() });
  await resyncAllBuckets(sql, userId);
  revalidateAll();
  return { ok: true };
}

/** Move money into or out of a bucket or goal by hand: a buffer dip, a top-up, the trip paid for. */
export async function adjustBucket(bucketId: string, dollars: string, direction: "in" | "out", note: string, on: string): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireUserId();
  const [bucket] = await getSql().query<{ id: string }>(`select id from bucket where id = $1 and closed_at is null`, [bucketId]);
  if (!bucket) return { ok: false, message: "No such bucket." };
  let cents: bigint;
  try {
    cents = parseDollarsToCents(dollars);
  } catch {
    return { ok: false, message: "Enter dollars and cents." };
  }
  if (cents <= 0n) return { ok: false, message: "Amount must be positive." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { ok: false, message: "Bad date." };
  const signed = direction === "out" ? -cents : cents;
  const sql = getSql();
  const [row] = await sql.query<{ id: string }>(
    `insert into bucket_entry (bucket_id, amount_cents, occurred_on, source, note) values ($1, $2, $3, 'manual', $4) returning id`,
    [bucketId, signed.toString(), on, note.trim() || null],
  );
  await writeAudit(sql, { actor: userId, action: "bucket_entry.manual", entity: "bucket_entry", entityId: row.id, after: { bucketId, amount_cents: signed, note }, ip: await requestIp() });
  revalidateAll();
  return { ok: true };
}

function parseGoalFields(targetDollars: string, dueOn: string, perPaycheckDollars: string): { ok: true; target: bigint | null; dueOn: string | null; perPaycheck: bigint } | { ok: false; message: string } {
  let target: bigint | null = null;
  let perPaycheck = 0n;
  try {
    if (targetDollars.trim() !== "") target = parseDollarsToCents(targetDollars);
    if (perPaycheckDollars.trim() !== "") perPaycheck = parseDollarsToCents(perPaycheckDollars);
  } catch {
    return { ok: false, message: "Enter dollars and cents." };
  }
  if (target !== null && target <= 0n) return { ok: false, message: "The target must be more than zero." };
  if (perPaycheck < 0n) return { ok: false, message: "The paycheck slice can't be negative." };
  if (dueOn.trim() !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { ok: false, message: "Bad date." };
  return { ok: true, target, dueOn: dueOn.trim() || null, perPaycheck };
}

/** A goal: a bucket with a purpose. Optionally fed a fixed slice of every paycheck until it reaches its target. */
export async function createGoal(name: string, targetDollars: string, dueOn: string, perPaycheckDollars: string): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireUserId();
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) return { ok: false, message: "Give it a name, 2 to 60 characters." };
  const f = parseGoalFields(targetDollars, dueOn, perPaycheckDollars);
  if (!f.ok) return f;
  const sql = getSql();
  const id = `goal_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const [{ sort }] = await sql.query<{ sort: number }>(`select coalesce(max(sort), 0) + 1 as sort from bucket`);
  await sql.query(
    `insert into bucket (id, name, sort, kind, target_cents, due_on, per_paycheck_cents) values ($1, $2, $3, 'goal', $4, $5, $6)`,
    [id, clean, sort, f.target === null ? null : f.target.toString(), f.dueOn, f.perPaycheck.toString()],
  );
  await writeAudit(sql, { actor: userId, action: "goal.create", entity: "bucket", entityId: id, after: { name: clean, target_cents: f.target, due_on: f.dueOn, per_paycheck_cents: f.perPaycheck }, ip: await requestIp() });
  revalidateAll();
  return { ok: true };
}

export async function updateGoal(id: string, targetDollars: string, dueOn: string, perPaycheckDollars: string): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireUserId();
  const f = parseGoalFields(targetDollars, dueOn, perPaycheckDollars);
  if (!f.ok) return f;
  const sql = getSql();
  const [before] = await sql.query<{ target_cents: string | null; due_on: string | null; per_paycheck_cents: string }>(
    `select target_cents::text, due_on::text, per_paycheck_cents::text from bucket where id = $1 and kind = 'goal' and closed_at is null`,
    [id],
  );
  if (!before) return { ok: false, message: "No such goal." };
  await sql.query(`update bucket set target_cents = $2, due_on = $3, per_paycheck_cents = $4 where id = $1`, [id, f.target === null ? null : f.target.toString(), f.dueOn, f.perPaycheck.toString()]);
  await writeAudit(sql, { actor: userId, action: "goal.update", entity: "bucket", entityId: id, before, after: { target_cents: f.target, due_on: f.dueOn, per_paycheck_cents: f.perPaycheck }, ip: await requestIp() });
  revalidateAll();
  return { ok: true };
}

/** Close a goal. Its ledger stays; whatever it still held goes back to unassigned savings. */
export async function closeGoal(id: string): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireUserId();
  const sql = getSql();
  const [row] = await sql.query<{ name: string }>(`update bucket set closed_at = now() where id = $1 and kind = 'goal' and closed_at is null returning name`, [id]);
  if (!row) return { ok: false, message: "No such goal." };
  await writeAudit(sql, { actor: userId, action: "goal.close", entity: "bucket", entityId: id, before: { name: row.name }, ip: await requestIp() });
  revalidateAll();
  return { ok: true };
}
