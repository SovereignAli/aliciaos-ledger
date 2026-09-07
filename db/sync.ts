import { neon } from "@neondatabase/serverless";
import type { Sql } from "../lib/db.ts";
import { recategorizeAll } from "../lib/categories/index.ts";
import { syncInstitution } from "../lib/sync.ts";

/**
 * Sync every linked institution from the CLI (also what a cron job would call).
 *
 * Usage:  node --env-file=.env.local db/sync.ts [--full] [--recategorize]
 *   --full          reset every cursor first, so all history is re-pulled (idempotent)
 *   --recategorize  re-run the rules over everything not set by hand
 */
const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const client = neon(url);
const sql: Sql = { query: async (text, params = []) => (await client.query(text, params)) as never };

if (args.has("--full")) {
  await sql.query(`update institution set sync_cursor = null where provider <> 'manual'`);
  console.log("cursors reset");
}
const rows = await sql.query<{ id: string; name: string }>(`select id, name from institution where provider <> 'manual' order by name`);
for (const r of rows) {
  const outcome = await syncInstitution(sql, r.id, "system");
  console.log(r.name, outcome.ok ? outcome.result : `${outcome.status} ${outcome.code} ${outcome.message}`);
}
if (args.has("--recategorize")) console.log("recategorize", await recategorizeAll(sql));
