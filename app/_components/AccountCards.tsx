import type { AccountView } from "@/lib/queries/transactions";
import { AccountMenu } from "./AccountMenu";
import { DAY, fmtDate, Money } from "./Money";
import { Window } from "./Window";

export function AccountCards({ accounts, title = "Accounts", style, className = "", lead, children }: { accounts: AccountView[]; editableRole?: boolean; title?: string; style?: React.CSSProperties; className?: string; lead?: string; children?: React.ReactNode }) {
  return (
    <Window title={title} right={`${accounts.length} account${accounts.length === 1 ? "" : "s"}.`} style={style} className={`flex flex-1 flex-col ${className}`} bodyClassName="flex flex-1 flex-col px-[22px] pb-3 pt-1">
      {lead ? <p className="text-[13px] leading-relaxed text-ink2">{lead}</p> : null}
      {children}
      {accounts.length === 0 ? (
        <p className="mt-auto py-6 text-center text-[13.5px] text-ink2">No accounts in this group yet.</p>
      ) : (
        <ul className="mt-auto">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold leading-tight sm:truncate" title={a.officialName ?? a.name}>{a.name}</div>
                <div className="truncate text-[12px] text-ink3">
                  {a.institutionName}
                  {a.mask ? <span className="mono ml-1.5">··{a.mask}</span> : null}
                  {a.balanceAsOf && a.institutionStatus !== "ok" ? <span className="ml-1.5 text-warn">as of {fmtDate(DAY, a.balanceAsOf)}</span> : null}
                </div>
              </div>
              <div className="num shrink-0 font-display text-[18px] font-bold leading-none sm:text-[20px]">{a.balance === null ? "—" : <Money cents={a.balance} signed={false} />}</div>
              <AccountMenu accountId={a.id} role={a.role} name={a.name} />
            </li>
          ))}
        </ul>
      )}
    </Window>
  );
}
