import { formatCents } from "@/lib/money";
import { budgetLines, spendingByCategory } from "@/lib/queries/overview";
import { listPaychecks } from "@/lib/queries/buckets";
import { BudgetRow } from "../../_components/BudgetRow";
import { fmtDate, MONTH_LONG, MONTH_SHORT } from "../../_components/Money";
import { StatTile } from "../../_components/StatTile";
import { Window } from "../../_components/Window";

const idx = (n: number) => ({ "--i": n } as React.CSSProperties);

export default async function BudgetsPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const month = today.slice(0, 7);
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayOfMonth = Number(today.slice(8, 10));
  const dayFraction = dayOfMonth / daysInMonth;
  const [lines, history, paychecks] = await Promise.all([budgetLines(month), spendingByCategory(6), listPaychecks(12)]);

  const spent = lines.reduce((s, l) => s + l.spent, 0n);
  const budgeted = lines.reduce((s, l) => s + (l.target ?? 0n), 0n);
  const withTarget = lines.filter((l) => l.target !== null).length;
  const living = paychecks.filter((p) => p.postedAt.startsWith(month)).reduce((s, p) => s + p.living, 0n);
  const left = budgeted - spent;
  const active = lines.filter((l) => l.spent > 0n || l.target !== null || l.avg3 > 0n);
  const quiet = lines.filter((l) => !active.includes(l));

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  const cell = new Map(history.map((r) => [`${r.categoryId}|${r.month}`, r.total]));
  const histCats = [...new Map(history.map((r) => [r.categoryId, r.name])).entries()];
  const totalsByMonth = months.map((mm) => history.filter((r) => r.month === mm).reduce((s, r) => s + r.total, 0n));

  return (
    <div className="grid grid-cols-12 gap-[18px]">
      <div className="col-span-12 grid grid-cols-2 gap-[18px] sm:grid-cols-4">
        <div style={idx(0)}><StatTile label={`${fmtDate(MONTH_LONG, month).split(" ")[0]} spent`} value={formatCents(spent)} hint={`Day ${dayOfMonth} of ${daysInMonth}.`} /></div>
        <div style={idx(1)}><StatTile label="Budgeted" value={budgeted > 0n ? formatCents(budgeted) : "—"} hint={withTarget ? `${withTarget} categor${withTarget === 1 ? "y" : "ies"} with a target.` : "No targets yet."} /></div>
        <div style={idx(2)}><StatTile label="Left to spend" value={budgeted > 0n ? formatCents(left) : "—"} hint={budgeted > 0n ? (left < 0n ? "Over for the month." : `${formatCents(left / BigInt(Math.max(1, daysInMonth - dayOfMonth + 1)))} a day.`) : "Set targets below."} /></div>
        <div style={idx(3)}><StatTile label="Living money" value={formatCents(living)} hint={living > 0n ? "This month's paychecks, after the split." : "No paycheck yet this month."} /></div>
      </div>

      <Window title={`Categories · ${fmtDate(MONTH_LONG, month)}`} right={budgeted > 0n ? `${formatCents(spent)} of ${formatCents(budgeted)}.` : "Targets apply from this month on."} className="col-span-12 lg:col-span-7" style={idx(4)} bodyClassName="px-[22px] pb-2 pt-1">
        {budgeted > 0n ? (
          <div className="mb-3">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--sidebar-active)]">
              <div className={spent > budgeted ? "bg-negative" : "bg-accent"} style={{ width: `${Math.min(100, Number((spent * 100n) / budgeted))}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11.5px] text-ink3"><span>{Math.round(Number((spent * 100n) / budgeted))}% spent</span><span>{Math.round(dayFraction * 100)}% of the month gone</span></div>
          </div>
        ) : null}
        <ul>
          {active.map((l) => <BudgetRow key={l.categoryId} categoryId={l.categoryId} name={l.name} spent={l.spent} target={l.target} avg3={l.avg3} month={month} dayFraction={dayFraction} />)}
        </ul>
        {quiet.length ? (
          <details className="mt-2 text-[12.5px] text-ink3">
            <summary className="cursor-pointer list-none py-1">{quiet.length} quiet categor{quiet.length === 1 ? "y" : "ies"}</summary>
            <ul>
              {quiet.map((l) => <BudgetRow key={l.categoryId} categoryId={l.categoryId} name={l.name} spent={l.spent} target={l.target} avg3={l.avg3} month={month} dayFraction={dayFraction} />)}
            </ul>
          </details>
        ) : null}
      </Window>

      <Window title="Six months" right="Spending by category." className="col-span-12 flex flex-col lg:col-span-5" style={idx(5)} bodyClassName="flex flex-1 flex-col pb-0 pt-1">
        <p className="px-[22px] pb-3 text-[13px] leading-relaxed text-ink2">The Set buttons use the last three full months.</p>
        <div className="mt-auto overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left">
                <th className="eyebrow border-b border-line px-[22px] py-2 font-medium">Category</th>
                {months.map((mm, i) => <th key={mm} className={`eyebrow border-b border-line py-2 pl-2 text-right font-medium ${i === months.length - 1 ? "pr-[22px]" : "pr-2"}`}>{fmtDate(MONTH_SHORT, mm).split(" ")[0]}</th>)}
              </tr>
            </thead>
            <tbody>
              {histCats.map(([id, name]) => (
                <tr key={id} className="border-t border-line-soft">
                  <td className="truncate px-[22px] py-2">{name}</td>
                  {months.map((mm, i) => {
                    const v = cell.get(`${id}|${mm}`) ?? 0n;
                    return <td key={mm} className={`mono num py-2 pl-2 text-right ${i === months.length - 1 ? "pr-[22px]" : "pr-2"} ${v === 0n ? "text-ink3" : ""}`}>{v === 0n ? "·" : formatCents(v, { sign: "never" }).replace(/\.\d\d$/, "")}</td>;
                  })}
                </tr>
              ))}
              <tr className="border-t border-line bg-[var(--sidebar-active)] font-semibold">
                <td className="px-[22px] py-3 text-[11px] uppercase tracking-wide text-ink3">Total</td>
                {totalsByMonth.map((t, i) => <td key={i} className={`mono num py-3 pl-2 text-right ${i === totalsByMonth.length - 1 ? "pr-[22px]" : "pr-2"}`}>{formatCents(t, { sign: "never" }).replace(/\.\d\d$/, "")}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Window>
    </div>
  );
}
