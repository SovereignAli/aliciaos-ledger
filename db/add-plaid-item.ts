import { readFile } from "node:fs/promises";
import { CountryCode } from "plaid";
import { neon } from "@neondatabase/serverless";
import { writeAudit } from "../lib/audit.ts";
import { encryptToken, loadKey } from "../lib/crypto.ts";
import type { Sql } from "../lib/db.ts";
import { getPlaidClient } from "../lib/plaid/client.ts";
import { syncInstitution } from "../lib/sync.ts";

/**
 * Adopt Items that were linked elsewhere (the coverage probe) without
 * re-linking, so their history carries over.
 *
 * Usage:  node --env-file=.env.local db/add-plaid-item.ts tokens.json
 *
 * The file may be any JSON shape; every object containing an `access_token`
 * string is treated as one Item. Tokens are read once, encrypted, and the
 * file is never written to.
 */
const file = process.argv[2];
if (!file) {
  console.error("usage: node --env-file=.env.local db/add-plaid-item.ts <tokens.json>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const tokens = findTokens(JSON.parse(await readFile(file, "utf8")));
if (tokens.length === 0) {
  console.error("no access_token fields found in that file");
  process.exit(1);
}

const client = neon(url);
const sql: Sql = { query: async (text, params = []) => (await client.query(text, params)) as never };
const plaid = getPlaidClient();
const key = loadKey();

for (const accessToken of tokens) {
  const item = await plaid.itemGet({ access_token: accessToken });
  const itemId = item.data.item.item_id;
  let name = item.data.item.institution_name ?? null;
  if (!name && item.data.item.institution_id) {
    const inst = await plaid.institutionsGetById({ institution_id: item.data.item.institution_id, country_codes: [CountryCode.Us] });
    name = inst.data.institution.name;
  }
  name ??= `Item ${itemId.slice(0, 8)}`;

  const [row] = await sql.query<{ id: string; inserted: boolean }>(
    `insert into institution (name, provider, external_id, access_token, status)
     values ($1, 'plaid', $2, $3, 'ok')
     on conflict (provider, external_id) do update set access_token = excluded.access_token, name = excluded.name, status = 'ok', last_error = null
     returning id, (xmax = 0) as inserted`,
    [name, itemId, encryptToken(accessToken, key)],
  );
  await writeAudit(sql, {
    actor: "system",
    action: row.inserted ? "institution.link" : "institution.relink",
    entity: "institution",
    entityId: row.id,
    after: { name, provider: "plaid", external_id: itemId, via: "add-plaid-item" },
  });
  console.log(`${row.inserted ? "added" : "updated"} ${name} (${itemId})`);
  const outcome = await syncInstitution(sql, row.id, "system");
  console.log(outcome.ok ? outcome.result : `  sync failed: ${outcome.status} ${outcome.code} ${outcome.message}`);
}

function findTokens(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => findTokens(v, out));
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.access_token === "string" && obj.access_token.startsWith("access-")) out.push(obj.access_token);
    else Object.values(obj).forEach((v) => findTokens(v, out));
  }
  return out;
}
