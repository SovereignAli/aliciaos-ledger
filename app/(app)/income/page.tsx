import Link from "next/link";
import { formatCents } from "@/lib/money";
import { incomeByMonth, incomeSummary, listAccounts, listIncomeEntries, splitTotals } from "@/lib/queries/income";
import { listCategories, listTransactions } from "@/lib/queries/transactions";
import { AddIncomeForm } from "../../_components/AddIncomeForm";
import { BucketBar } from "../../_components/BucketBar";
import { Donut } from "../../_components/Donut";
import { BucketIcon } from "../../_components/HeroIcons";
import { IncomeTable } from "../../_components/IncomeTable";
import { DAY, fmtDate, MONTH_SHORT } from "../../_components/Money";
import { StatTile } from "../../_components/StatTile";
import { TxnList } from "../../_components/TxnList";
import { Window } from "../../_components/Window";

const idx = (n: number) => ({ "--i": n } as React.CSSProperties);

/** Payroll and other work income: the money the split acts on. */
export default async function IncomePage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const year = Number(today.slice(0, 4));
  const [entries, summary, manualAccounts, passive, categories, months, split] = await Promise.all([
    listIncomeEntries(),
    incomeSummary(year),
    listAccounts(),
    listTransactions({ group: "passive_income", limit: 50 }),
    listCategories(),
    incomeByMonth(12),
    splitTotals(year),
  ]);
  const pct = (part: bigint) => (split.gross > 0n ? `${(Number((part * 1000n) / split.gross) / 10).toFixed(1)}%` : "—");
  const slices = [
    { id: "buffer", name: "Buffer", value: split.buffer, note: "Held against a lean month." },
    { id: "investing", name: "Investing", value: split.invest, note: "Sent on to the brokerage." },
    { id: "free", name: "Living", value: split.living, note: "Left in checking to spend." },
  ].sort((a, b) => (a.value === b.value ? 0 : a.value > b.value ? -1 : 1));
  const max = months.reduce((m, x) => (x.income > m ? x.income : m), 1n);
  const paidMonths = months.filter((m) => m.income > 0n);
  const avg = paidMonths.length ? paidMonths.reduce((s, m) => s + m.income, 0n) / BigInt(paidMonths.length) : 0n;

  return (
    <div className="grid grid-cols-12 gap-[18px]">
      <div className="col-span-12 grid grid-cols-2 gap-[18px] sm:grid-cols-4">
        <div style={idx(0)}><StatTile label={`${year} income`} value={formatCents(summary.total)} hint="Gross, before the split." /></div>
        <div style={idx(1)}><StatTile label="Paychecks" value={String(summary.count)} hint={summary.firstOn ? `Since ${fmtDate(DAY, summary.firstOn)}.` : "None yet this year."} /></div>
        <div style={idx(2)}><StatTile label="Typical month" value={formatCents(avg)} hint={paidMonths.length ? `Across ${paidMonths.length} paid month${paidMonths.length === 1 ? "" : "s"}.` : "No paid months yet."} /></div>
        <div style={idx(3)}><StatTile label={`${year} passive`} value={formatCents(summary.passive)} hint="Interest and dividends." /></div>
      </div>

      <Window title="By month" right="Last twelve months." className="col-span-12" style={idx(4)} bodyClassName="flex flex-col px-[22px] pb-[18px] pt-1">
        <div className="grid items-end gap-3 border-b border-line [grid-template-columns:repeat(6,minmax(0,1fr))] sm:[grid-template-columns:var(--cols)]" style={{ "--cols": `repeat(${months.length}, minmax(0, 1fr))`, height: 120 } as React.CSSProperties}>
          {months.map((m, n) => (
            <div key={m.month} className={`h-full items-end justify-center ${n < months.length - 6 ? "hidden sm:flex" : "flex"}`}>
              <div className="grow-y w-full max-w-[36px] rounded-t-[7px] bg-accent" style={{ "--n": n, height: `${Math.max(m.income > 0n ? 3 : 0, Number((m.income * 116n) / max))}px` } as React.CSSProperties} title={`${fmtDate(MONTH_SHORT, m.month)} ${formatCents(m.income)}`} />
            </div>
          ))}
        </div>
        <div className="mt-2 grid gap-3 [grid-template-columns:repeat(6,minmax(0,1fr))] sm:[grid-template-columns:var(--cols)]" style={{ "--cols": `repeat(${months.length}, minmax(0, 1fr))` } as React.CSSProperties}>
          {months.map((m, n) => (
            <div key={m.month} className={`text-center ${n < months.length - 6 ? "hidden sm:block" : ""}`}>
              <div className="eyebrow !text-ink2">{fmtDate(MONTH_SHORT, m.month).split(" ")[0]}</div>
              <div className={`mono num text-[11px] ${m.income > 0n ? "text-ink3" : "text-ink3/50"}`}>{m.income > 0n ? formatCents(m.income, { sign: "never" }).replace(/\.\d\d$/, "") : "·"}</div>
            </div>
          ))}
        </div>
      </Window>

      <IncomeTable entries={entries} right={`${entries.length} paycheck${entries.length === 1 ? "" : "s"}.`} className="col-span-12 lg:col-span-8" style={idx(5)} />

      <div className="col-span-12 grid grid-rows-[1fr_auto] gap-[18px] lg:col-span-4">
        <Window title="Where it went" right={`${year}, ${split.count} split${split.count === 1 ? "" : "s"}.`} style={idx(6)} bodyClassName="flex flex-col gap-4 px-[22px] pb-[22px] pt-1">
          <div className="pt-3"><Donut segments={slices} total={split.gross} label="Gross" value={formatCents(split.gross, { sign: "never" }).replace(/\.\d\d$/, "")} /></div>
          <div className="mt-auto pt-6"><BucketBar segments={slices.map(({ id, name, value }) => ({ id, name, value }))} total={split.gross} legend={false} /></div>
          <ul className="grid gap-3">
            {slices.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="cat-ico"><BucketIcon id={s.id} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="font-medium">{s.name}</span>
                    <span className="mono num">{formatCents(s.value)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-[11.5px] text-ink3">
                    <span>{s.note}</span>
                    <span className="mono num">{pct(s.value)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-line pt-3 text-[12.5px] text-ink2">
            <span>Gross, after withholding.</span>
            <span className="mono num text-ink">{formatCents(split.gross)}</span>
          </div>
        </Window>
        <Window title="Add income" right="For what the banks miss." style={idx(7)} bodyClassName="px-[22px] pb-[18px] pt-1">
          {manualAccounts.length ? (
            <AddIncomeForm accounts={manualAccounts} today={today} />
          ) : (
            <p className="text-[13px] leading-relaxed text-ink2">
              Hand-entered income needs a manual account to land in. Add one under <Link href="/settings" className="underline underline-offset-2">Settings</Link>.
            </p>
          )}
        </Window>
      </div>

      <TxnList txns={passive} categories={categories} emptyText="No interest or dividends yet." title="Passive income" right="Real for taxes, not for spending." className="col-span-12" style={idx(8)} />
    </div>
  );
}
