import type { Sql } from "./db.ts";

export interface AuditEntry {
  actor: string; // Clerk user id, or 'system' for CLI scripts
  action: string; // 'txn.insert', 'txn.update', ...
  entity: string; // table name
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** An audit_log row for every mutation: actor, action, entity, before/after, timestamp. */
export async function writeAudit(sql: Sql, entry: AuditEntry): Promise<void> {
  await sql.query(
    `insert into audit_log (actor, action, entity, entity_id, before, after, ip)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::inet)`,
    [
      entry.actor,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before, jsonReplacer),
      entry.after === undefined ? null : JSON.stringify(entry.after, jsonReplacer),
      entry.ip ?? null,
    ],
  );
}

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  return value;
}
