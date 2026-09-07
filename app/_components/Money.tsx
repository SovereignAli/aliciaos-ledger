import { formatCents, type Cents } from "@/lib/money";

/** Signed money in a table cell: green in, plain out, muted zero. */
export function Money({ cents, signed = true, className = "" }: { cents: Cents; signed?: boolean; className?: string }) {
  const tone = cents > 0n ? "text-positive" : cents < 0n ? "text-negative" : "text-ink3";
  return <span className={`num whitespace-nowrap ${signed ? tone : ""} ${className}`}>{formatCents(cents, { sign: signed ? "auto" : "never" })}</span>;
}

export const MONTH_LONG = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
export const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
export const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function fmtDate(f: Intl.DateTimeFormat, iso: string): string {
  return f.format(new Date(`${iso.length === 7 ? iso + "-01" : iso}T00:00:00Z`));
}
