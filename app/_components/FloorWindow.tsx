import { formatCents, type Cents } from "@/lib/money";
import type { BucketEntryView, BucketOverview, HeldAccount } from "@/lib/queries/buckets";
import { BucketBar } from "./BucketBar";
import { BucketIcon, HeroIcon } from "./HeroIcons";
import { TrendDownIcon, TrendUpIcon } from "./Icons";
import { DAY, fmtDate, Money } from "./Money";
import { Window } from "./Window";

const SPLIT_LABEL: Record<string, string> = { buffer: "Buffer", investing: "Investing" };

/**
 * The buckets are bookkeeping on one real savings balance. This window turns
 * them into the number that matters: how low that balance may go.
 */
export function FloorWindow({ overview, account, entries, yearGross, avgSpend, className = "", style }: {
  overview: BucketOverview; account: HeldAccount | null; entries: BucketEntryView[]; yearGross: Cents; avgSpend: Cents; className?: string; style?: React.CSSProperties;
}) {
  const { buckets, held, policy } = overview;
  const balance = account?.balance ?? 0n;
  const margin = balance - held;
  const under = margin < 0n;
  const by = (id: string) => buckets.find((b) => b.id === id)?.balance ?? 0n;
  const pos = (v: Cents) => (v > 0n ? v : 0n);
  const months = avgSpend > 0n ? Number((pos(by("buffer")) * 10n) / avgSpend) / 10 : null;
  const LABEL: Record<string, string> = { ...SPLIT_LABEL };
  for (const b of buckets) LABEL[b.id] = b.name;

  const rows = [
    { id: "buffer", value: pos(by("buffer")), note: months !== null ? `${policy.bufferPct}% of the ${formatCents(yearGross)} split this year. About ${months.toFixed(1)} month${months === 1 ? "" : "s"} of spending.` : `${policy.bufferPct}% of gross, against a lean month.` },
    { id: "investing", value: pos(by("investing")), note: by("investing") < 0n ? `Ahead by ${formatCents(-by("investing"))}: more has gone to the brokerage than the ${policy.investPct}% set aside.` : "Split but not yet at the brokerage. Leaves the minimum once the transfer lands." },
    ...buckets.filter((b) => b.kind === "goal").map((b) => ({ id: b.id, value: b.held, note: b.target ? `${formatCents(b.held)} of ${formatCents(b.target)}${b.dueOn ? `, by ${fmtDate(DAY, b.dueOn)}` : ""}.` : "Open-ended goal." })),
  ];
  const segments = [
    ...rows.map((r) => ({ id: r.id, name: LABEL[r.id], value: r.value })),
    { id: "free", name: "Above the minimum", value: pos(margin) },
  ];

  return (
    <Window title="Minimum savings threshold" right={account ? `${account.name}${account.asOf ? `, as of ${fmtDate(DAY, account.asOf)}` : ""}.` : "No savings account yet."} className={className} style={style} bodyClassName="grid gap-5 px-[22px] pb-5 pt-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-10">
      <div className="flex flex-col gap-4">
        <div>
          <div className="num font-display text-[34px] font-bold leading-none tracking-tight">{formatCents(held)}</div>
          {account ? (
            <ul className="mt-3 grid gap-1.5 text-[13px]">
              <li className="flex items-center gap-2.5">
                <span className="cat-ico"><HeroIcon name="building-library" className="h-4 w-4" /></span>
                <span className="flex-1 text-ink2">In savings now</span>
                <span className="num font-semibold text-ink">{formatCents(balance)}</span>
              </li>
              <li className={`flex items-center gap-2.5 ${under ? "text-negative" : "text-positive"}`}>
                <span className={`cat-ico ${under ? "!bg-[color-mix(in_oklab,var(--negative)_14%,transparent)] !text-negative" : "!bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] !text-positive"}`}>
                  {under ? <TrendDownIcon className="h-4 w-4" /> : <TrendUpIcon className="h-4 w-4" />}
                </span>
                <span className="flex-1">{under ? "Below the minimum" : "Above the minimum"}</span>
                <span className="num font-semibold">{under ? `−${formatCents(-margin)}` : `+${formatCents(margin)}`}</span>
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-[13px] leading-snug text-ink2">Link a bank to compare against a real balance.</p>
          )}
        </div>
        <BucketBar segments={segments} total={balance > held ? balance : held} amounts={false} />
        <p className="mt-auto text-[12px] leading-snug text-ink3">Everything stays in savings. Only what sits above the minimum is free to move.</p>
      </div>

      <div className="flex flex-col">
        <ul className="grid">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-line-soft py-3 first:pt-1">
              <span className="cat-ico"><BucketIcon id={r.id} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="font-medium">{LABEL[r.id]}</span>
                  <span className="mono num">{formatCents(r.value)}</span>
                </div>
                <div className="text-[11.5px] leading-snug text-ink3">{r.note}</div>
              </div>
            </li>
          ))}
        </ul>
        {entries.length ? (
          <details className="group mt-3">
            <summary className="eyebrow cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
              History <span className="text-ink3">· {entries.length} entries</span> <span className="inline-block transition-transform group-open:rotate-90">›</span>
            </summary>
            <ul className="mt-2 grid text-[12.5px] sm:grid-cols-2 sm:gap-x-6">
              {entries.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1">
                  <span className="truncate">
                    <span className="mono num mr-2 text-ink3">{fmtDate(DAY, e.occurredOn)}</span>
                    <span className="text-ink2">{LABEL[e.bucketId] ?? e.bucketId}</span>
                    <span className="ml-2 text-ink3">{e.note ?? (e.source === "paycheck" ? "from paycheck" : e.description ?? "")}</span>
                  </span>
                  <Money cents={e.amount} className="mono text-[12px]" />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </Window>
  );
}
