import "server-only";
import { getSql } from "../db.ts";
import { centsFromDb, type Cents } from "../money.ts";
import type { AccountSubtype, AccountType, ProviderId } from "../providers/types.ts";

export interface LinkedAccount {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: AccountType;
  subtype: AccountSubtype;
  balance: Cents | null;
  balanceAsOf: string | null;
}

export interface LinkedInstitution {
  id: string;
  name: string;
  provider: ProviderId;
  status: "ok" | "needs_reauth" | "error";
  lastError: string | null;
  lastSyncedAt: string | null;
  accounts: LinkedAccount[];
}

/** Every non-manual institution with its accounts and their latest balance snapshot. */
export async function listLinkedInstitutions(): Promise<LinkedInstitution[]> {
  const sql = getSql();
  const institutions = await sql.query<{
    id: string; name: string; provider: ProviderId; status: LinkedInstitution["status"]; last_error: string | null; last_synced_at: string | null;
  }>(
    `select id, name, provider, status, last_error, last_synced_at::text
       from institution where provider <> 'manual' order by created_at`,
  );
  if (institutions.length === 0) return [];

  const accounts = await sql.query<{
    id: string; institution_id: string; name: string; official_name: string | null; mask: string | null;
    type: AccountType; subtype: AccountSubtype; current_cents: string | null; as_of: string | null;
  }>(
    `select a.id, a.institution_id, a.name, a.official_name, a.mask, a.type, a.subtype,
            b.current_cents::text, b.as_of::text
       from account a
       left join lateral (
         select current_cents, as_of from balance_snapshot
          where account_id = a.id order by as_of desc, created_at desc limit 1
       ) b on true
      where a.is_active and a.institution_id = any($1::uuid[])
      order by a.type, a.name`,
    [institutions.map((i) => i.id)],
  );

  return institutions.map((i) => ({
    id: i.id,
    name: i.name,
    provider: i.provider,
    status: i.status,
    lastError: i.last_error,
    lastSyncedAt: i.last_synced_at,
    accounts: accounts
      .filter((a) => a.institution_id === i.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        officialName: a.official_name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        balance: a.current_cents === null ? null : centsFromDb(a.current_cents),
        balanceAsOf: a.as_of,
      })),
  }));
}
