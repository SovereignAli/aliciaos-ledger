"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import { requestIp } from "@/lib/request";
import { getSql } from "@/lib/db";
import { ingestConnection } from "@/lib/ingest";
import { ensureManualInstitution } from "@/lib/institutions";
import { ManualProvider } from "@/lib/providers/manual";
import type { AccountSubtype, AccountType } from "@/lib/providers/types";

/**
 * Server Actions are reachable by direct POST, so each one authenticates
 * itself before touching data. Manual input goes through the ManualProvider
 * and the shared ingest path — the same road a synced row will travel.
 */

export interface ActionState {
  ok: boolean;
  message: string | null;
}

const ACCOUNT_TYPES: AccountType[] = ["depository", "investment", "credit", "loan"];
const ACCOUNT_SUBTYPES: AccountSubtype[] = ["checking", "savings", "brokerage", "ira", "roth", "hysa", "other"];

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function addIncomeEntry(_prev: ActionState, form: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const accountExternalId = str(form, "account");
  const postedAt = str(form, "date");
  const amount = str(form, "amount");
  const description = str(form, "description");
  const direction = str(form, "direction") === "out" ? "out" : "in";

  if (!accountExternalId) return { ok: false, message: "Pick an account." };
  if (!description) return { ok: false, message: "Give it a description — this is what dedupe keys on." };

  try {
    const sql = getSql();
    const conn = await ensureManualInstitution(sql, userId);
    const provider = new ManualProvider({
      entries: [{ accountExternalId, postedAt, amount, direction, description }],
    });
    const result = await ingestConnection(sql, provider, conn, {
      actor: userId,
      since: "0001-01-01",
      ip: await requestIp(),
    });
    revalidatePath("/");
    revalidatePath("/income");
    if (result.txnsInserted === 0) {
      return { ok: true, message: "Already recorded — that exact entry was here before, so nothing changed." };
    }
    return {
      ok: true,
      message: result.transfersPaired ? "Saved, and paired with its other leg as an internal transfer." : "Saved.",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not save that entry." };
  }
}

export async function addAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const name = str(form, "name");
  const type = str(form, "type") as AccountType;
  const subtype = str(form, "subtype") as AccountSubtype;

  if (!name) return { ok: false, message: "Name the account." };
  if (!ACCOUNT_TYPES.includes(type)) return { ok: false, message: "Pick a type." };
  if (!ACCOUNT_SUBTYPES.includes(subtype)) return { ok: false, message: "Pick a subtype." };

  const externalId = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!externalId) return { ok: false, message: "That name has no letters or digits in it." };

  try {
    const sql = getSql();
    const conn = await ensureManualInstitution(sql, userId);
    const provider = new ManualProvider({ accounts: [{ externalId, name, type, subtype }] });
    await ingestConnection(sql, provider, conn, { actor: userId, since: "0001-01-01", ip: await requestIp() });
    revalidatePath("/");
    revalidatePath("/income");
    return { ok: true, message: `Added ${name}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not add that account." };
  }
}
