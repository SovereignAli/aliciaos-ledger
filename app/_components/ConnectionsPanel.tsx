import { shortAccountName } from "@/lib/names";
import { formatCents } from "@/lib/money";
import type { LinkedInstitution } from "@/lib/queries/connections";
import { PlaidLinkButton } from "./PlaidLinkButton";
import { SyncButton } from "./SyncButton";
import { Window } from "./Window";

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function StatusBadge({ status }: { status: LinkedInstitution["status"] }) {
  if (status === "ok") return <span className="rounded-full border border-accent/60 px-1.5 text-[10px] uppercase tracking-wider text-accent">live</span>;
  if (status === "needs_reauth") return <span className="rounded-full border border-warn px-1.5 text-[10px] uppercase tracking-wider text-warn">reconnect</span>;
  return <span className="rounded-full border border-crit px-1.5 text-[10px] uppercase tracking-wider text-crit">error</span>;
}

export function ConnectionsPanel({ institutions, nonce, plaidReady }: { institutions: LinkedInstitution[]; nonce?: string; plaidReady: boolean }) {
  return (
    <Window title="Connections" right="Read-only via Plaid." bodyClassName="" style={{ "--i": 7 } as React.CSSProperties}>

      {institutions.length ? (
        <ul className="mt-3 border-t border-line-soft">
          {institutions.map((inst) => (
            <li key={inst.id} className="border-b border-line-soft px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{inst.name}</span>
                  <StatusBadge status={inst.status} />
                </div>
                {inst.status === "needs_reauth" ? (
                  <PlaidLinkButton mode={{ kind: "update", institutionId: inst.id }} nonce={nonce} className="btn px-2.5 py-1 text-[12px]">
                    Reconnect
                  </PlaidLinkButton>
                ) : (
                  <SyncButton institutionId={inst.id} />
                )}
              </div>
              <ul className="mt-2 grid gap-1">
                {inst.accounts.map((a) => (
                  <li key={a.id} className="flex min-w-0 items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate text-ink2">
                      {shortAccountName(a.name)}
                      {a.mask ? <span className="num ml-1 text-[11px] text-ink3">··{a.mask}</span> : null}
                    </span>
                    <span className="num whitespace-nowrap">
                      {a.balance === null ? "—" : formatCents(a.balance)}
                      {inst.status !== "ok" && a.balanceAsOf ? (
                        <span className="ml-1 text-[10.5px] text-ink3">as of {DAY.format(new Date(`${a.balanceAsOf}T00:00:00Z`))}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 text-[11.5px] text-ink3">
                {inst.lastSyncedAt ? `Synced ${WHEN.format(new Date(inst.lastSyncedAt))}.` : "Never synced."}
                {inst.status !== "ok" && inst.lastError ? <span className="ml-1.5 text-warn">· {inst.lastError.split(":")[0]}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line-soft px-4 py-3 text-[13px] leading-relaxed text-ink2">
          Connect each bank once. Balances and transactions then keep themselves current.
        </p>
      )}

      <div className="border-t border-line-soft px-4 py-3">
        {plaidReady ? (
          <PlaidLinkButton mode={{ kind: "new" }} nonce={nonce} className="btn w-full">
            Connect a bank
          </PlaidLinkButton>
        ) : (
          <p className="text-[12.5px] leading-snug text-ink3">
            Add <code className="num">PLAID_CLIENT_ID</code> and <code className="num">PLAID_SECRET</code> to the environment to enable connecting.
          </p>
        )}
      </div>
    </Window>
  );
}
