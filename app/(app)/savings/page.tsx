import { balanceHistory, listAccountsByRole, listCategories, listHiddenAccounts, listTransactions, yearTotals } from "@/lib/queries/transactions";
import { netWorthByRoleAt } from "@/lib/queries/overview";
import { formatCents } from "@/lib/money";
import { AccountCards } from "../../_components/AccountCards";
import { HiddenAccounts } from "../../_components/HiddenAccounts";
import { LineChart } from "../../_components/LineChart";
import { DAY, fmtDate, Money, MONTH_SHORT } from "../../_components/Money";
import { StatTile } from "../../_components/StatTile";
import { Trend } from "../../_components/Trend";
import { TxnList } from "../../_components/TxnList";
import { Window } from "../../_components/Window";

const idx = (n: number) => ({ "--i": n } as React.CSSProperties);

export default async function SavingsPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const year = Number(today.slice(0, 4));
  const monthAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const accounts = await listAccountsByRole("long_term_savings");
  const ids = accounts.map((a) => a.id);
  const [txns, categories, totals, history, hidden, then] = await Promise.all([
    listTransactions({ role: "long_term_savings", includeInternal: true, limit: 200 }),
    listCategories(),
    yearTotals(ids, year),
    balanceHistory(ids),
    listHiddenAccounts(),
    netWorthByRoleAt(monthAgo),
  ]);
  const total = accounts.reduce((s, a) => s + (a.balance ?? 0n), 0n);
  const before = then.get("long_term_savings");
  const apy = accounts.find((a) => a.apy !== null)?.apy ?? null;
  const lastDeposit = txns.find((t) => t.amount > 0n && t.categoryGroup !== "passive_income");
  // Merge per-account snapshots into one series per day.
  const byDay = new Map<string, bigint>();
  for (const h of history) byDay.set(h.asOf, (byDay.get(h.asOf) ?? 0n) + h.current);
  const series = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([asOf, current]) => ({ asOf, current }));
  // Interest by month, from the same activity the feed shows.
  const interest = new Map<string, bigint>();
  for (const t of txns) if (t.categoryGroup === "passive_income") interest.set(t.postedAt.slice(0, 7), (interest.get(t.postedAt.slice(0, 7)) ?? 0n) + t.amount);
  const months = [...interest.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 6);
  const maxInterest = months.reduce((m, [, v]) => (v > m ? v : m), 1n);

  return (
    <div className="grid grid-cols-12 gap-[18px]">
      <div className="col-span-12 flex flex-col lg:col-span-4">
        <AccountCards accounts={accounts} lead="Money that sits and grows. Interest lands as passive income, never as money to spend." style={idx(0)}>
          {months.length ? (
            <div className="mt-5">
              <div className="eyebrow mb-2">Interest by month</div>
              <ul className="grid gap-1.5">
                {months.map(([m, v]) => (
                  <li key={m} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 text-[12.5px]">
                    <span className="text-ink3">{fmtDate(MONTH_SHORT, m).split(" ")[0]}</span>
                    <div className="bar"><div style={{ width: `${Number((v * 100n) / maxInterest)}%` }} /></div>
                    <Money cents={v} className="mono text-[12px]" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </AccountCards>
        <HiddenAccounts accounts={hidden.filter((h) => h.role === "long_term_savings")} />
      </div>

      <Window title="Balance" right={apy !== null ? `${apy.toFixed(2)}% APY.` : "One point per sync."} className="col-span-12 lg:col-span-8" style={idx(1)} bodyClassName="px-[22px] pb-4 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="num font-display text-[44px] font-[750] leading-none tracking-[-0.02em]">{formatCents(total)}</div>
          <Trend delta={before === undefined ? null : total - before} />
        </div>
        <div className="mt-3"><LineChart points={series} /></div>
      </Window>

      <div className="col-span-12 grid grid-cols-1 gap-[18px] sm:grid-cols-3">
        <div style={idx(2)}><StatTile label={`${year} interest`} value={formatCents(totals.passive)} hint={apy !== null ? `At ${apy.toFixed(2)}%, about ${formatCents(BigInt(Math.round(Number(total) * apy / 100)))} a year from here.` : "Passive income."} /></div>
        <div style={idx(3)}><StatTile label={`${year} added`} value={formatCents(totals.contributions)} hint="Your deposits." /></div>
        <div style={idx(4)}><StatTile label="Last deposit" value={lastDeposit ? fmtDate(DAY, lastDeposit.postedAt) : "—"} hint={lastDeposit ? `${formatCents(lastDeposit.amount)}.` : "None yet."} /></div>
      </div>

      <TxnList txns={txns} categories={categories} showAccount={accounts.length > 1} title="Activity" className="col-span-12" style={idx(5)} />
    </div>
  );
}
