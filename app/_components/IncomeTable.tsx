import { formatCents } from "@/lib/money";
import type { IncomeEntry } from "@/lib/queries/income";
import { CategoryIcon } from "./HeroIcons";
import { DAY, fmtDate, Money, MONTH_LONG } from "./Money";
import { Window } from "./Window";

/** The paychecks, grouped by month, with the living slice beside the gross when the row was split. */
export function IncomeTable({ entries, title = "Paychecks", right, style, className = "" }: { entries: IncomeEntry[]; title?: string; right?: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  if (entries.length === 0) {
    return (
      <Window title={title} right={right} className={className} style={style} bodyClassName="px-6 py-12 text-center">
        <div className="font-display text-xl font-medium">No paychecks recognized yet</div>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink2">Payroll is recognized by rule. If a deposit should be here, open it under Transactions and set its category to Payroll.</p>
      </Window>
    );
  }
  const groups = new Map<string, { label: string; gross: bigint; living: bigint; rows: IncomeEntry[] }>();
  for (const e of entries) {
    const key = e.postedAt.slice(0, 7);
    const g = groups.get(key) ?? { label: fmtDate(MONTH_LONG, key), gross: 0n, living: 0n, rows: [] };
    g.gross += e.amount;
    g.living += e.living ?? 0n;
    g.rows.push(e);
    groups.set(key, g);
  }
  return (
    <Window title={title} right={right} className={className} style={style} bodyClassName="pb-0 pt-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px] sm:min-w-[560px]">
          <thead>
            <tr className="text-left">
              <th className="eyebrow border-b border-line px-[22px] py-2 font-medium">Received</th>
              <th className="eyebrow border-b border-line px-3 py-2 font-medium">From</th>
              <th className="hidden eyebrow border-b border-line px-3 py-2 font-medium sm:table-cell">Into</th>
              <th className="eyebrow border-b border-line px-3 py-2 text-right font-medium">Gross</th>
              <th className="hidden eyebrow border-b border-line px-[22px] py-2 text-right font-medium sm:table-cell">Living</th>
            </tr>
          </thead>
          {[...groups.entries()].map(([key, g]) => (
            <tbody key={key}>
              <tr className="band band-strong">
                <td colSpan={2} className="px-[22px] py-2.5 align-baseline text-[12px] font-semibold text-ink2 sm:hidden">{g.label}</td>
                <td colSpan={3} className="hidden px-[22px] py-2.5 align-baseline text-[12px] font-semibold text-ink2 sm:table-cell">{g.label}</td>
                <td className="num px-3 py-2.5 text-right align-baseline text-[12px] font-medium text-ink2">{formatCents(g.gross)}</td>
                <td className="hidden num px-[22px] py-2.5 text-right align-baseline text-[12px] font-medium text-ink2 sm:table-cell">{g.living > 0n ? formatCents(g.living) : ""}</td>
              </tr>
              {g.rows.map((e) => (
                <tr key={e.id} className="border-t border-line-soft">
                  <td className="num whitespace-nowrap px-[22px] py-2.5 text-ink2 max-sm:pr-1">{fmtDate(DAY, e.postedAt)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="cat-ico"><CategoryIcon id={e.categoryId} /></span>
                      <div className="min-w-0">
                        <div className="max-w-[7ch] truncate sm:max-w-[30ch]" title={e.description}>{e.description}</div>
                        <div className="hidden truncate text-[11.5px] text-ink3 sm:block">{e.categoryName}{e.pending ? " · pending" : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink2 sm:table-cell">{e.accountName}</td>
                  <td className="px-3 py-2.5 text-right"><Money cents={e.amount} className="font-medium" /></td>
                  <td className="mono num hidden px-[22px] py-2.5 text-right text-[12.5px] sm:table-cell">{e.living === null ? <span className="text-ink3">—</span> : formatCents(e.living)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Window>
  );
}
