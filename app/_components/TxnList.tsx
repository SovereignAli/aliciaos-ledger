import type { CategoryOption, TxnView } from "@/lib/queries/transactions";
import { CategoryPicker } from "./CategoryPicker";
import { CategoryIcon } from "./HeroIcons";
import { Window } from "./Window";
import { TxnRow } from "./TxnRow";
import { TxnDetail } from "./TxnDetail";
import { DAY, fmtDate, Money, MONTH_LONG } from "./Money";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** The transaction feed. Grouped by month with a net subtotal; category is editable inline. */
export function TxnList({ txns, categories, showAccount = true, editable = true, emptyText = "Nothing here yet.", title, right, style, className = "", groupBy = "month" }: {
  txns: TxnView[];
  categories: CategoryOption[];
  showAccount?: boolean;
  editable?: boolean;
  emptyText?: string;
  title?: string;
  right?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /** "day" adds a header per day with its net, under heavier month dividers. */
  groupBy?: "month" | "day";
}) {
  if (txns.length === 0) {
    return (
      <Window title={title} right={right} className={className} style={style} bodyClassName="px-6 py-10 text-center text-[14px] text-ink2">
        {emptyText}
      </Window>
    );
  }
  const months = new Map<string, { label: string; net: bigint; rows: TxnView[]; days: Map<string, { net: bigint; rows: TxnView[] }> }>();
  for (const t of txns) {
    const key = t.postedAt.slice(0, 7);
    const g = months.get(key) ?? { label: fmtDate(MONTH_LONG, key), net: 0n, rows: [] as TxnView[], days: new Map<string, { net: bigint; rows: TxnView[] }>() };
    if (!t.isInternal) g.net += t.amount;
    g.rows.push(t);
    const d = g.days.get(t.postedAt) ?? { net: 0n, rows: [] as TxnView[] };
    if (!t.isInternal) d.net += t.amount;
    d.rows.push(t);
    g.days.set(t.postedAt, d);
    months.set(key, g);
  }
  // Day groups have no date column; the description spans one column either way.
  const cols = (showAccount ? 4 : 3) - (groupBy === "day" ? 1 : 0);
  const row = (t: TxnView) => (
    <TxnRow key={t.id} as="tr" label={`${t.description}, ${fmtDate(DAY, t.postedAt)}`} detail={<TxnDetail t={t} />} className={`border-t border-line-soft ${t.isInternal ? "opacity-55" : ""}`}>
      {groupBy === "day" ? null : <td className={`num whitespace-nowrap py-2 pl-4 pr-2 align-top text-ink2 ${showAccount ? "" : "w-[64px]"}`}>{fmtDate(DAY, t.postedAt)}</td>}
      <td className="min-w-0 py-2 pl-4 pr-4 align-top">
        {/* Icon beside a text block, so the category line sits under the description, as on phones. */}
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="cat-ico mt-0.5"><CategoryIcon id={t.isInternal ? "internal_transfer" : t.categoryId} /></span>
          <div className="min-w-0 flex-1">
            <div className={`min-w-0 truncate ${showAccount ? "max-w-[36ch]" : "max-w-[25ch]"}`} title={t.description}>{t.description}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {editable ? (
                <CategoryPicker txnId={t.id} categoryId={t.categoryId} source={t.categorySource} isInternal={t.isInternal} categories={categories} description={t.description} />
              ) : (
                <span className="text-[12px] text-ink3">{t.isInternal ? "Internal transfer" : t.categoryName ?? "Uncategorized"}</span>
              )}
              {t.pending ? <span className="rounded-full border border-warn px-1.5 text-[10px] uppercase tracking-wider text-warn">pending</span> : null}
            </div>
          </div>
        </div>
      </td>
      {showAccount ? (
        <td className="whitespace-nowrap px-4 py-2 align-top text-[12.5px] text-ink2">
          {t.accountName}
          <div className="text-[11px] text-ink3">{t.institutionName}</div>
        </td>
      ) : null}
      <td className={`px-4 py-2 text-right align-top ${showAccount ? "" : "w-[112px]"}`}><Money cents={t.amount} className="font-medium" /></td>
    </TxnRow>
  );
  // Phones: a plain list. Tables with hidden columns lay out differently across browsers,
  // and Safari squeezed the description to nothing; a flex row can't.
  const phoneRow = (t: TxnView) => (
    <TxnRow key={t.id} as="li" label={`${t.description}, ${fmtDate(DAY, t.postedAt)}`} detail={<TxnDetail t={t} />} className={`flex items-start gap-2.5 border-t border-line-soft px-4 py-2.5 ${t.isInternal ? "opacity-55" : ""}`}>
      <span className="cat-ico mt-0.5"><CategoryIcon id={t.isInternal ? "internal_transfer" : t.categoryId} /></span>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 break-words text-[13.5px] leading-snug" title={t.description}>{t.description}</div>
        {groupBy === "day" ? null : <div className="num text-[11.5px] text-ink3">{fmtDate(DAY, t.postedAt)}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {editable ? (
            <CategoryPicker txnId={t.id} categoryId={t.categoryId} source={t.categorySource} isInternal={t.isInternal} categories={categories} description={t.description} />
          ) : (
            <span className="text-[12px] text-ink3">{t.isInternal ? "Internal transfer" : t.categoryName ?? "Uncategorized"}</span>
          )}
          {t.pending ? <span className="rounded-full border border-warn px-1.5 text-[10px] uppercase tracking-wider text-warn">pending</span> : null}
        </div>
      </div>
      <div className="shrink-0 pr-2 pt-0.5 text-right text-[14px]"><Money cents={t.amount} className="font-medium" /></div>
    </TxnRow>
  );
  const phoneList = (
    <div className="sm:hidden">
      {[...months.entries()].map(([key, g]) => (
        <section key={key}>
          <div className={`band-flat flex items-baseline justify-between gap-3 px-4 py-2.5 ${groupBy === "day" ? "bg-[var(--sidebar-active)]" : "bg-sunk/60"}`}>
            <span className={groupBy === "day" ? "text-[12.5px] font-semibold text-ink" : "text-[12px] font-semibold text-ink2"}>{g.label}</span>
            <span className="num whitespace-nowrap text-[12px] font-medium text-ink2"><Money cents={g.net} className="text-ink2" /></span>
          </div>
          {groupBy === "day"
            ? [...g.days.entries()].map(([day, d]) => (
                <div key={day}>
                  <div className="flex items-baseline justify-between gap-3 px-4 pb-0.5 pt-2.5 text-[11.5px]">
                    <span className="font-semibold text-ink3">{fmtDate(WEEKDAY, day)}</span>
                    <span className="num whitespace-nowrap text-ink3"><Money cents={d.net} className="text-ink3" /></span>
                  </div>
                  <ul>{d.rows.map(phoneRow)}</ul>
                </div>
              ))
            : <ul>{g.rows.map(phoneRow)}</ul>}
        </section>
      ))}
    </div>
  );
  return (
    <Window title={title} right={right} className={className} style={style} bodyClassName={title ? "pt-3" : ""}>
      {phoneList}
      <div className="hidden overflow-x-auto sm:block">
        <table className={`w-full border-collapse text-[13.5px] ${showAccount ? "min-w-[640px]" : "table-fixed"}`}>
          {/* Fixed layouts take their column widths from the first row, which here is a spanning
              month header, so the widths are declared up front. */}
          {showAccount ? null : (
            <colgroup>
              {groupBy === "day" ? null : <col style={{ width: 151 }} />}
              <col />
              <col style={{ width: 124 }} />
            </colgroup>
          )}
          {[...months.entries()].map(([key, g]) => (
            <tbody key={key}>
              <tr className={`band ${groupBy === "day" ? "band-strong" : "band-soft"}`}>
                <td colSpan={cols} className="px-4 py-2.5 align-baseline">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={groupBy === "day" ? "text-[12.5px] font-semibold text-ink" : "text-[12px] font-semibold text-ink2"}>{g.label}</span>
                    <span className="num whitespace-nowrap text-[12px] font-medium text-ink2"><span className="mr-1.5 hidden text-[10px] uppercase tracking-[0.08em] text-ink3 sm:inline">Net</span><Money cents={g.net} className="text-ink2" /></span>
                  </div>
                </td>
              </tr>
              {groupBy === "day"
                ? [...g.days.entries()].flatMap(([day, d]) => [
                    <tr key={`h-${day}`}>
                      <td colSpan={cols} className="px-4 pb-0.5 pt-2.5 align-baseline">
                        <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
                          <span className="font-semibold text-ink3">{fmtDate(WEEKDAY, day)}</span>
                          <span className="num whitespace-nowrap text-ink3"><Money cents={d.net} className="text-ink3" /></span>
                        </div>
                      </td>
                    </tr>,
                    ...d.rows.map(row),
                  ])
                : g.rows.map(row)}
            </tbody>
          ))}
        </table>
      </div>
    </Window>
  );
}
