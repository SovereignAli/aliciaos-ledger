import { neon } from "@neondatabase/serverless";

/**
 * The one query interface everything below the adapter boundary uses.
 * Kept deliberately tiny so tests and CLI scripts can supply their own
 * implementation (node-postgres, PGlite) without touching the Neon driver.
 *
 * Rows come back with Postgres `bigint` as strings and `bytea` as Buffers;
 * mappers convert with `centsFromDb`.
 */
export interface Sql {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
}

let cached: Sql | undefined;

/**
 * Neon over HTTP: one round trip per statement, no session state, works in
 * every Vercel runtime. Every statement here is written to be idempotent so
 * the lack of an interactive transaction is safe.
 */
export function getSql(): Sql {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = neon(url);
  cached = {
    async query<Row>(text: string, params: unknown[] = []) {
      return (await client.query(text, params)) as Row[];
    },
  };
  return cached;
}
