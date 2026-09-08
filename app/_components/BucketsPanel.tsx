import { formatCents, type Cents } from "@/lib/money";
import type { BucketEntryView, BucketOverview, BucketPoint, HeldAccount, PaycheckView } from "@/lib/queries/buckets";
import { FloorWindow } from "./FloorWindow";
import { AdjustWindow } from "./AdjustWindow";
import { DAY, fmtDate, Money } from "./Money";
import { Sparkline } from "./Sparkline";
import { BucketIcon } from "./HeroIcons";
import { Window } from "./Window";


/** The Cash tab's buckets, paychecks, controls and ledger. Order sets the entry stagger. */
export function BucketsPanel({ overview, paychecks, entries, history, today, account, avgSpend, startIndex = 0 }: {
  overview: BucketOverview; paychecks: PaycheckView[]; entries: BucketEntryView[]; history: Record<string, BucketPoint[]>; today: string; account: HeldAccount | null; avgSpend: Cents; startIndex?: number;
}) {
  const { buckets, free, cash, held, policy } = overview;
  const i = (n: number) => ({ "--i": startIndex + n } as React.CSSProperties);
  const pct = (id: string) => (id === "buffer" ? policy.bufferPct : policy.investPct);
  const totals = paychecks.reduce((t, p) => ({ gross: t.gross + p.gross, buffer: t.buffer + p.buffer, invest: t.invest + p.invest, living: t.living + p.living }), { gross: 0n, buffer: 0n, invest: 0n, living: 0n });

  return (
    <>
      <Window title="Buckets and goals" right={`${formatCents(held)} parked of ${formatCents(cash)} cash.`} className="col-span-12 lg:col-span-8" style={i(0)} bodyClassName="px-[22px] pb-3 pt-1">
        <ul>
          {buckets.map((b) => {
            const pts = history[b.id] ?? [];
            const first = pts[0]?.on;
            const goal = b.kind === "goal";
            const ahead = b.balance < 0n ? -b.balance : 0n;
            return (
              <li key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-1 border-b border-line-soft py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="cat-ico h-8 w-8 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4"><BucketIcon id={b.id} /></span>
                  <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{b.name} <span className="ml-1 font-normal text-ink3">{goal ? (b.target ? `of ${formatCents(b.target).replace(/\.\d\d$/, "")}` : "goal") : `${pct(b.id)}%`}</span></div>
                  <div className="text-[12px] text-ink3">
                    {ahead > 0n
                      ? `${formatCents(ahead)} ahead: more went to the brokerage than the split set aside`
                      : `${formatCents(b.funded)} in${b.released > 0n ? `, ${formatCents(b.released)} out` : ""}${first ? ` · since ${fmtDate(DAY, first)}` : ""}`}
                  </div>
                  </div>
                </div>
                <div className="col-span-2 text-accent sm:col-span-1"><Sparkline points={pts} width={170} height={38} /></div>
                <div className="num text-right font-display text-[20px] font-bold leading-none"><Money cents={b.held} signed={false} /></div>
              </li>
            );
          })}
        </ul>
        <p className="pt-3 text-[12px] leading-snug text-ink3">All of it stays in savings. {formatCents(free)} is free to spend from checking after the cards; {formatCents(overview.unassigned)} in savings has no job yet. Living {policy.livingPct}% of each paycheck is what stays free.</p>
      </Window>

      <Window title="Paychecks · split" right={`${paychecks.length} this year.`} className="col-span-12 lg:col-span-7" bodyClassName="pb-0 pt-3" style={i(2)}>
        {paychecks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] sm:min-w-[540px]">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow border-b border-line px-[22px] py-2 font-medium">Received</th>
                  <th className="eyebrow border-b border-line px-3 py-2 text-right font-medium">Gross</th>
                  <th className="eyebrow border-b border-line px-3 py-2 text-right font-medium">Buffer</th>
                  <th className="hidden eyebrow border-b border-line px-3 py-2 text-right font-medium sm:table-cell">Investing</th>
                  <th className="eyebrow border-b border-line px-[22px] py-2 text-right font-medium">Living</th>
                </tr>
              </thead>
              <tbody>
                {paychecks.map((p) => (
                  <tr key={p.txnId} className="border-t border-line-soft">
                    <td className="num px-[22px] py-2.5 text-ink2">{fmtDate(DAY, p.postedAt)}</td>
                    <td className="px-3 py-2.5 text-right"><Money cents={p.gross} /></td>
                    <td className="mono num px-3 py-2.5 text-right text-[12.5px]">{formatCents(p.buffer)}</td>
                    <td className="mono num hidden px-3 py-2.5 text-right text-[12.5px] sm:table-cell">{formatCents(p.invest)}</td>
                    <td className="mono num px-[22px] py-2.5 text-right text-[12.5px] font-semibold">{formatCents(p.living)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line bg-[var(--sidebar-active)] font-semibold">
                  <td className="px-[22px] py-3.5 text-[12px] uppercase tracking-wide text-ink3">Total</td>
                  <td className="num px-3 py-3.5 text-right">{formatCents(totals.gross)}</td>
                  <td className="mono num px-3 py-3.5 text-right text-[12.5px]">{formatCents(totals.buffer)}</td>
                  <td className="mono num hidden px-3 py-3.5 text-right text-[12.5px] sm:table-cell">{formatCents(totals.invest)}</td>
                  <td className="mono num px-[22px] py-3.5 text-right text-[12.5px]">{formatCents(totals.living)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-[22px] py-6 text-center text-[13px] text-ink2">No payroll deposits recognized yet.</p>
        )}
      </Window>

      <AdjustWindow policy={policy} buckets={buckets.map((b) => ({ id: b.id, name: b.name }))} today={today} className="col-span-12 lg:col-span-5" style={i(3)} />

      <FloorWindow overview={overview} account={account} entries={entries} yearGross={totals.gross} avgSpend={avgSpend} className="col-span-12" style={i(5)} />
    </>
  );
}
