"use server";

import { CountryCode, Products } from "plaid";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUserId } from "@/lib/auth";
import { encryptToken, loadKey } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { getPlaidClient, plaidConfigured } from "@/lib/plaid/client";
import { requestIp } from "@/lib/request";
import { loadConnection, staleInstitutionIds, syncInstitution, type SyncOutcome } from "@/lib/sync";

/**
 * The connect flow. All Plaid calls happen here, server-side; the browser only
 * ever sees a short-lived link token and hands back a public token.
 * Read-only products only. Never payment initiation, never transfer.
 */

const LINK_CLIENT_NAME = "AliciaOS Ledger";
const HISTORY_DAYS = 730;
const SYNC_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type LinkTokenResult = { ok: true; linkToken: string } | { ok: false; message: string };

/** New link, or update mode when an institution id is given. */
export async function createLinkToken(institutionId?: string): Promise<LinkTokenResult> {
  const userId = await requireUserId();
  if (!plaidConfigured()) return { ok: false, message: "Plaid keys are not set on the server." };
  try {
    const plaid = getPlaidClient();
    const base = {
      user: { client_user_id: userId },
      client_name: LINK_CLIENT_NAME,
      language: "en",
      country_codes: [CountryCode.Us],
      // OAuth institutions (Chase, Capital One, ...) send the browser to the bank and back
      // here. Must be https and registered under Developers → API settings in the Plaid dashboard.
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    };
    const req = institutionId
      ? { ...base, access_token: (await loadConnection(getSql(), institutionId)).accessToken ?? undefined }
      : {
          ...base,
          products: [Products.Transactions],
          required_if_supported_products: [Products.Investments],
          transactions: { days_requested: HISTORY_DAYS },
        };
    try {
      const res = await plaid.linkTokenCreate(req);
      return { ok: true, linkToken: res.data.link_token };
    } catch (err) {
      // Until the redirect URI is registered in the Plaid dashboard, Plaid refuses any
      // request that names it. Retry without it so credential-based banks still link;
      // OAuth banks will refuse inside Link until the dashboard step is done.
      if (!("redirect_uri" in req) || !/redirect/i.test(plaidMessage(err))) throw err;
      const { redirect_uri: _dropped, ...withoutRedirect } = req;
      void _dropped;
      const res = await plaid.linkTokenCreate(withoutRedirect);
      return { ok: true, linkToken: res.data.link_token };
    }
  } catch (err) {
    return { ok: false, message: plaidMessage(err) };
  }
}

export type CompleteLinkResult = { ok: true; institutionId: string; sync: SyncOutcome } | { ok: false; message: string };

/** Exchange the public token, store the access token encrypted, sync immediately. */
export async function completeLink(
  publicToken: string,
  institution: { institution_id: string; name: string } | null,
): Promise<CompleteLinkResult> {
  const userId = await requireUserId();
  const sql = getSql();
  const ip = await requestIp();
  try {
    const plaid = getPlaidClient();
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token, item_id } = exchange.data;
    const name = institution?.name ?? (await institutionNameFor(item_id, access_token));
    const ciphertext = encryptToken(access_token, loadKey());

    const [row] = await sql.query<{ id: string; inserted: boolean }>(
      `insert into institution (name, provider, external_id, access_token, status, last_error)
       values ($1, 'plaid', $2, $3, 'ok', null)
       on conflict (provider, external_id) do update
         set access_token = excluded.access_token, name = excluded.name, status = 'ok', last_error = null
       returning id, (xmax = 0) as inserted`,
      [name, item_id, ciphertext],
    );
    await writeAudit(sql, {
      actor: userId,
      action: row.inserted ? "institution.link" : "institution.relink",
      entity: "institution",
      entityId: row.id,
      after: { name, provider: "plaid", external_id: item_id, plaid_institution_id: institution?.institution_id ?? null },
      ip,
    });
    const sync = await syncInstitution(sql, row.id, userId, ip);
    revalidatePath("/");
    return { ok: true, institutionId: row.id, sync };
  } catch (err) {
    return { ok: false, message: plaidMessage(err) };
  }
}

/** Update mode finished in Link: clear the flag and pull whatever we missed. */
export async function completeReauth(institutionId: string): Promise<SyncOutcome> {
  const userId = await requireUserId();
  const sql = getSql();
  await sql.query(`update institution set status = 'ok', last_error = null where id = $1`, [institutionId]);
  const outcome = await syncInstitution(sql, institutionId, userId, await requestIp());
  revalidatePath("/");
  return outcome;
}

export async function syncNow(institutionId: string): Promise<SyncOutcome> {
  const userId = await requireUserId();
  const outcome = await syncInstitution(getSql(), institutionId, userId, await requestIp());
  revalidatePath("/");
  return outcome;
}

/** Called from the page on load when something is older than SYNC_MAX_AGE_MS. */
export async function syncStale(): Promise<{ synced: number }> {
  const userId = await requireUserId();
  if (!plaidConfigured()) return { synced: 0 };
  const sql = getSql();
  const ip = await requestIp();
  const ids = await staleInstitutionIds(sql, SYNC_MAX_AGE_MS);
  for (const id of ids) await syncInstitution(sql, id, userId, ip);
  if (ids.length) revalidatePath("/");
  return { synced: ids.length };
}

async function institutionNameFor(itemId: string, accessToken: string): Promise<string> {
  try {
    const plaid = getPlaidClient();
    const item = await plaid.itemGet({ access_token: accessToken });
    const instId = item.data.item.institution_id;
    if (item.data.item.institution_name) return item.data.item.institution_name;
    if (!instId) return `Item ${itemId.slice(0, 8)}`;
    const inst = await plaid.institutionsGetById({ institution_id: instId, country_codes: [CountryCode.Us] });
    return inst.data.institution.name;
  } catch {
    return `Item ${itemId.slice(0, 8)}`;
  }
}

function plaidMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
  if (data?.error_code) return `${data.error_code}: ${data.error_message ?? ""}`.trim();
  return err instanceof Error ? err.message : "Plaid request failed.";
}
