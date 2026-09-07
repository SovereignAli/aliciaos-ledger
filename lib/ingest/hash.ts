import { createHash } from "node:crypto";
import type { Cents } from "../money.ts";

/**
 * dedupe_hash = SHA-256 of `account_id | posted_at | amount_cents | lower(trim(description))`.
 *
 * This is what lets sync be switched on later without every hand-entered
 * transaction reappearing as a duplicate: the manual row and the synced row
 * collapse to one, and the synced one wins because it carries an external_id.
 */
export function dedupeHash(accountId: string, postedAt: string, amountCents: Cents, description: string): Buffer {
  const canonical = `${accountId}|${postedAt}|${amountCents.toString()}|${description.trim().toLowerCase()}`;
  return createHash("sha256").update(canonical, "utf8").digest();
}
