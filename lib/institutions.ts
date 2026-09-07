import type { Sql } from "./db.ts";
import type { Connection, ProviderId } from "./providers/types.ts";
import { writeAudit } from "./audit.ts";

export const MANUAL_INSTITUTION_EXTERNAL_ID = "manual";

interface InstitutionRow {
  id: string;
  provider: ProviderId;
  external_id: string | null;
}

/**
 * The one institution manual entries hang off. Created on first use so a fresh
 * database needs no seed step.
 */
export async function ensureManualInstitution(sql: Sql, actor: string): Promise<Connection> {
  const [existing] = await sql.query<InstitutionRow>(
    `select id, provider, external_id from institution where provider = 'manual' and external_id = $1`,
    [MANUAL_INSTITUTION_EXTERNAL_ID],
  );
  if (existing) return toConnection(existing);

  const [row] = await sql.query<InstitutionRow>(
    `insert into institution (name, provider, external_id) values ('Manual', 'manual', $1)
     on conflict (provider, external_id) do update set name = institution.name
     returning id, provider, external_id`,
    [MANUAL_INSTITUTION_EXTERNAL_ID],
  );
  await writeAudit(sql, {
    actor,
    action: "institution.insert",
    entity: "institution",
    entityId: row.id,
    after: { name: "Manual", provider: "manual", external_id: MANUAL_INSTITUTION_EXTERNAL_ID },
  });
  return toConnection(row);
}

function toConnection(row: InstitutionRow): Connection {
  return { institutionId: row.id, provider: row.provider, externalId: row.external_id, accessToken: null, syncCursor: null };
}
