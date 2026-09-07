import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Forward-only migrations. Each file in db/migrations runs once, in name
 * order, inside its own transaction, and is recorded in schema_migration.
 * There is no "down". Fix a mistake with a new migration.
 */
export interface MigrationExecutor {
  /** Run a multi-statement SQL script (no parameters). */
  exec(sqlText: string): Promise<void>;
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
}

export interface Migration {
  name: string;
  sqlText: string;
}

export async function loadMigrations(dir: string): Promise<Migration[]> {
  const names = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  return Promise.all(names.map(async (name) => ({ name, sqlText: await readFile(path.join(dir, name), "utf8") })));
}

export async function applyMigrations(db: MigrationExecutor, migrations: Migration[], log = console.log): Promise<string[]> {
  await db.exec(
    `create table if not exists schema_migration (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const applied = new Set((await db.query<{ name: string }>(`select name from schema_migration`)).map((r) => r.name));

  // Refuse to run if the ledger has something we don't: forward-only means the
  // checked-in set must be a superset of what the database has seen.
  const known = new Set(migrations.map((m) => m.name));
  for (const name of applied) {
    if (!known.has(name)) throw new Error(`Database has migration ${name} that is not in db/migrations`);
  }

  const ran: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    log(`applying ${m.name}`);
    await db.exec("begin");
    try {
      await db.exec(m.sqlText);
      await db.query(`insert into schema_migration (name) values ($1)`, [m.name]);
      await db.exec("commit");
    } catch (err) {
      await db.exec("rollback");
      throw err;
    }
    ran.push(m.name);
  }
  return ran;
}
