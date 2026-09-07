import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { LinkedInstitution } from "@/lib/queries/connections";

const WHEN = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function shortName(name: string): string {
  if (/greenwich/i.test(name)) return "Credit union";
  if (/american express/i.test(name)) return "Amex";
  return name;
}

/** Sidebar summary: every linked bank, its balance, and whether it's healthy. */
export function BanksCard({ institutions }: { institutions: LinkedInstitution[] }) {
  const latest = institutions.map((i) => i.lastSyncedAt).filter(Boolean).sort().at(-1);
  return (
    <Link href="/" className="block rounded-[20px] bg-accent-soft p-3.5 transition-colors hover:bg-[var(--accent-wash)]">
      <div className="eyebrow mb-2.5 !text-accent-strong">Banks</div>
      {institutions.length ? (
        <ul className="grid gap-1.5 text-[12.5px] text-ink2">
          {institutions.map((i) => {
            const total = i.accounts.reduce((s, a) => s + (a.balance ?? 0n), 0n);
            const signed = i.accounts.every((a) => a.type === "credit") ? -total : total;
            return (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  {i.status !== "ok" ? <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-warn" /> : null}
                  {shortName(i.name)}
                </span>
                <span className="mono num text-[11px] text-ink3">{formatCents(signed)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-ink3">Nothing linked yet.</p>
      )}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink3">
        <span>{latest ? `Synced ${WHEN.format(new Date(latest))}.` : "Never synced."}</span>
        <span className={`h-[7px] w-[7px] rounded-full ${institutions.some((i) => i.status !== "ok") ? "bg-warn" : "bg-accent"}`} />
      </div>
    </Link>
  );
}
