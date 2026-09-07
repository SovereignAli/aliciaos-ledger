import { writeAudit } from "./audit.ts";
import { decryptToken, loadKey } from "./crypto.ts";
import type { Sql } from "./db.ts";
import { ingestConnection, type IngestResult } from "./ingest/ingest.ts";
import { ProviderAuthError } from "./providers/errors.ts";
import { providerFor } from "./providers/registry.ts";
import type { Connection, ProviderId } from "./providers/types.ts";

/**
 * Sync orchestration for linked institutions: load the row, decrypt the
 * token, run ingest, and translate the outcome into institution.status.
 *
 *   ok           — synced; balances and transactions are current
 *   needs_reauth — the institution wants Alex back (ITEM_LOGIN_REQUIRED);
 *                  keep serving the last known balance with its as_of date
 *   error        — something else; last_error says what
 */

interface InstitutionRow {
  id: string;
  name: string;
  provider: ProviderId;
  external_id: string | null;
  access_token: Uint8Array | null;
  status: "ok" | "needs_reauth" | "error";
  sync_cursor: string | null;
  last_synced_at: string | null;
}

export async function loadConnection(sql: Sql, institutionId: string): Promise<Connection & { name: string; status: InstitutionRow["status"] }> {
  const [row] = await sql.query<InstitutionRow>(
    `select id, name, provider, external_id, access_token, status, sync_cursor, last_synced_at::text
       from institution where id = $1`,
    [institutionId],
  );
  if (!row) throw new Error(`No institution ${institutionId}`);
  return {
    institutionId: row.id,
    provider: row.provider,
    externalId: row.external_id,
    accessToken: row.access_token ? decryptToken(row.access_token, loadKey()) : null,
    syncCursor: row.sync_cursor,
    name: row.name,
    status: row.status,
  };
}

export type SyncOutcome =
  | { ok: true; result: IngestResult }
  | { ok: false; status: "needs_reauth" | "error"; code: string; message: string };

export async function syncInstitution(sql: Sql, institutionId: string, actor: string, ip: string | null = null): Promise<SyncOutcome> {
  const conn = await loadConnection(sql, institutionId);
  const provider = providerFor(conn.provider);
  try {
    const result = await ingestConnection(sql, provider, conn, { actor, since: "0001-01-01", ip });
    await setStatus(sql, institutionId, "ok", null, actor, conn.status);
    return { ok: true, result };
  } catch (err) {
    const isAuth = err instanceof ProviderAuthError;
    const status = isAuth ? "needs_reauth" : "error";
    const code = (err as { code?: string }).code ?? "UNKNOWN";
    const message = err instanceof Error ? err.message : String(err);
    await setStatus(sql, institutionId, status, `${code}: ${message}`, actor, conn.status);
    return { ok: false, status, code, message };
  }
}

async function setStatus(sql: Sql, id: string, status: InstitutionRow["status"], lastError: string | null, actor: string, before: string) {
  await sql.query(`update institution set status = $2, last_error = $3 where id = $1`, [id, status, lastError]);
  if (before !== status) {
    await writeAudit(sql, {
      actor,
      action: "institution.status",
      entity: "institution",
      entityId: id,
      before: { status: before },
      after: { status, last_error: lastError },
    });
  }
}

/** Institutions that should be synced now: linked, not awaiting re-auth, and older than maxAgeMs. */
export async function staleInstitutionIds(sql: Sql, maxAgeMs: number): Promise<string[]> {
  const rows = await sql.query<{ id: string }>(
    `select id from institution
      where provider <> 'manual' and status <> 'needs_reauth'
        and (last_synced_at is null or last_synced_at < now() - ($1::bigint * interval '1 millisecond'))
      order by last_synced_at nulls first`,
    [String(maxAgeMs)],
  );
  return rows.map((r) => r.id);
}
