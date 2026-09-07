import { Pool } from "@neondatabase/serverless";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, loadMigrations } from "./migrate-core.ts";

/**
 * Usage:  node --env-file=.env.local db/migrate.ts
 *
 * Uses the WebSocket Pool (not HTTP) because a migration needs a real
 * transaction across many statements. Node 22+ has a global WebSocket.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
  const ran = await applyMigrations(
    {
      exec: async (text) => {
        await client.query(text);
      },
      query: async (text, params) => (await client.query(text, params)).rows,
    },
    await loadMigrations(dir),
  );
  console.log(ran.length ? `applied ${ran.length} migration(s)` : "database is up to date");
} finally {
  client.release();
  await pool.end();
}
