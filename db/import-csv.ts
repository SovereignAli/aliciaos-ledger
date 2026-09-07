import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import type { Sql } from "../lib/db.ts";
import { ingestConnection } from "../lib/ingest/index.ts";
import { ensureManualInstitution } from "../lib/institutions.ts";
import { ManualProvider, type ManualEntryInput } from "../lib/providers/manual.ts";

/**
 * Import hand-kept history through the manual provider, so it lands by the
 * exact same path a form entry does.
 *
 * Usage:  node --env-file=.env.local db/import-csv.ts <file.csv> --account <accountExternalId>
 *
 * CSV columns (header row required, order free):
 *   date          YYYY-MM-DD
 *   amount        unsigned dollars, e.g. 1250.00 or "1,250.00"
 *   description   free text
 *   direction     optional: "in" (default) or "out"
 *   account       optional: overrides --account per row
 *
 * The account must already exist (create it in the app first). Rows that hash
 * to something already stored are skipped, so re-running is harmless.
 */
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const accountFlag = args.indexOf("--account");
const defaultAccount = accountFlag >= 0 ? args[accountFlag + 1] : undefined;
if (!file) {
  console.error("usage: node --env-file=.env.local db/import-csv.ts <file.csv> --account <accountExternalId>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const rows = parseCsv(await readFile(file, "utf8"));
const entries: ManualEntryInput[] = rows.map((r, i) => {
  const account = r.account || defaultAccount;
  if (!account) throw new Error(`row ${i + 2}: no account column and no --account flag`);
  const direction = (r.direction || "in").toLowerCase();
  if (direction !== "in" && direction !== "out") throw new Error(`row ${i + 2}: direction must be in|out`);
  return { accountExternalId: account, postedAt: r.date, amount: r.amount, direction, description: r.description };
});

const client = neon(url);
const sql: Sql = { query: async (text, params = []) => (await client.query(text, params)) as never };
const conn = await ensureManualInstitution(sql, "system");
const result = await ingestConnection(sql, new ManualProvider({ entries }), conn, { actor: "system", since: "0001-01-01" });
console.log(result);

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((f) => f !== "")) records.push(record);
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length) {
    record.push(field);
    if (record.some((f) => f !== "")) records.push(record);
  }
  const [header, ...body] = records;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
