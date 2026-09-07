import type { Cents } from "../money.ts";

/**
 * Internal transfers must be paired and excluded. Every bucket split appears
 * twice — once leaving checking, once arriving in savings. Two transactions in
 * DIFFERENT accounts, with OPPOSITE amounts of EQUAL magnitude, within
 * ~3 days, are one internal transfer.
 *
 * Pairing runs at ingest, not at query time, so no report can forget to filter.
 * A manual `is_internal` correction is authoritative and is never re-paired.
 */
export const TRANSFER_WINDOW_DAYS = 3;

export interface TransferCandidate {
  id: string;
  accountId: string;
  postedAt: string; // YYYY-MM-DD
  amountCents: Cents;
  transferGroupId: string | null;
  isInternalManual: boolean;
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

export function daysApart(a: string, b: string): number {
  return Math.abs(dayNumber(a) - dayNumber(b));
}

export function isTransferPair(a: TransferCandidate, b: TransferCandidate): boolean {
  if (a.id === b.id) return false;
  if (a.accountId === b.accountId) return false;
  if (a.amountCents === 0n || a.amountCents !== -b.amountCents) return false;
  if (a.transferGroupId !== null || b.transferGroupId !== null) return false;
  if (a.isInternalManual || b.isInternalManual) return false;
  return daysApart(a.postedAt, b.postedAt) <= TRANSFER_WINDOW_DAYS;
}

/** Among valid partners, prefer the closest date; ties go to the earliest id for determinism. */
export function pickPartner(txn: TransferCandidate, candidates: TransferCandidate[]): TransferCandidate | null {
  let best: TransferCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (!isTransferPair(txn, c)) continue;
    const d = daysApart(txn.postedAt, c.postedAt);
    if (d < bestDistance || (d === bestDistance && best !== null && c.id < best.id)) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}
