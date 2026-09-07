import Link from "next/link";
import { formatCents } from "@/lib/money";
import { plaidConfigured } from "@/lib/plaid/client";
import { bucketOverview } from "@/lib/queries/buckets";
import { listLinkedInstitutions } from "@/lib/queries/connections";
import { bucketsHeldAt, budgetLines, cashFlowByMonth, netWorthByRole, netWorthByRoleAt } from "@/lib/queries/overview";
import { listTransactions } from "@/lib/queries/transactions";
import { AutoSync } from "../_components/AutoSync";
import { fmtDate, Money, MONTH_SHORT } from "../_components/Money";
import { StatTile } from "../_components/StatTile";
import { Window } from "../_components/Window";
import { BucketBar } from "../_components/BucketBar";
import { NetDot, Trend } from "../_components/Trend";
import { BucketIcon, CategoryIcon } from "../_components/HeroIcons";

const WHEN = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function OverviewPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const monthAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ roles, netWorth }, flow, recent, institutions, buckets, rolesThen, heldThen, budget] = await Promise.all([
    netWorthByRole(),
    cashFlowByMonth(4),
    listTransactions({ limit: 6 }),
    listLinkedInstitutions(),
    bucketOverview(today),
    netWorthByRoleAt(monthAgo),
    bucketsHeldAt(monthAgo),
    budgetLines(today.slice(0, 7)),
  ]);
  const budgeted = budget.reduce((s, l) => s + (l.target ?? 0n), 0n);
  const budgetSpent = budget.reduce((s, l) => s + l.spent, 0n);
  const hasHistory = rolesThen.size > 0 && [...rolesThen.values()].some((v) => v !== 0n);
  const delta = (role: "cash" | "long_term_savings" | "investment" | "credit") => (hasHistory ? (byRole.get(role) ?? 0n) - (rolesThen.get(role) ?? 0n) : null);
  const netThen = [...rolesThen.entries()].reduce((s, [r, v]) => (r === "credit" ? s - v : s + v), 0n);
  const freeThen = (rolesThen.get("cash") ?? 0n) - heldThen;
  const plaidReady = plaidConfigured();
  const byRole = new Map(roles.map((r) => [r.role, r.total]));
  const maxFlow = flow.reduce((m, f) => (f.income > m ? f.income : f.spending > m ? f.spending : m), 1n);
  const heldPct = buckets.cash > 0n ? Number((buckets.held * 100n) / buckets.cash) : 0;

  return (
    <>
      <AutoSync enabled={plaidReady && institutions.length > 0} />
      <div className="grid grid-cols-12 gap-[18px]">

        {/* Free to spend */}
        <Window title="Available cash" className="col-span-12 lg:col-span-5" style={{ "--i": 0 } as React.CSSProperties}>
          <div className="eyebrow mb-2.5 !text-accent-strong">After the buckets</div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div className="num font-display text-[52px] font-[750] leading-none tracking-[-0.02em] sm:text-[58px]">{formatCents(buckets.free).replace(/\.\d\d$/, "")}</div>
            <Trend delta={hasHistory ? buckets.free - freeThen : null} />
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink2">
            {formatCents(buckets.cash)} in cash accounts. {formatCents(buckets.held)} held in buckets{heldPct ? ` (${heldPct}%)` : ""}.
          </p>
          <div className="mt-4">
            <BucketBar total={buckets.cash} segments={[...buckets.buckets.map((b) => ({ id: b.id, name: b.name, value: b.balance })), { id: "free", name: "Free", value: buckets.free }]} amounts={false} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {budgeted > 0n ? (
              <Link href="/budgets" className={`pill ${budgetSpent > budgeted ? "!bg-negative/15 !text-negative" : ""}`}>
                {fmtDate(MONTH_SHORT, today.slice(0, 7)).split(" ")[0]} · {formatCents(budgetSpent, { sign: "never" }).replace(/\.\d\d$/, "")} of {formatCents(budgeted, { sign: "never" }).replace(/\.\d\d$/, "")} budget
              </Link>
            ) : (
              <Link href="/budgets" className="pill pill-quiet">Set a budget</Link>
            )}
          </div>
        </Window>

        {/* Buckets */}
        <Window title="Buckets" className="col-span-12 sm:col-span-6 lg:col-span-4" style={{ "--i": 1 } as React.CSSProperties} right={`${formatCents(buckets.held)} held.`} bodyClassName="flex h-[calc(100%-40px)] flex-col px-[22px] pb-[22px] pt-1">
          <div className="text-[13px] leading-relaxed text-ink2">Every paycheck is split on arrival. The living share stays free; these two stay in savings until needed.</div>
          <div className="mt-auto grid gap-3.5 pt-5">
            {buckets.buckets.map((b) => {
              const pct = buckets.cash > 0n && b.balance > 0n ? Math.min(100, Number((b.balance * 100n) / buckets.cash)) : 0;
              return (
                <div key={b.id} className="grid gap-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="flex items-center gap-2 font-semibold"><BucketIcon id={b.id} className="h-3.5 w-3.5 text-ink3" />{b.name} <span className="ml-1 font-normal text-ink3">{b.id === "buffer" ? buckets.policy.bufferPct : buckets.policy.investPct}%</span></span>
                    <span className="mono num text-[12.5px]">{formatCents(b.balance)}</span>
                  </div>
                  <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            <div className="text-[12px] leading-snug text-ink3">Living {buckets.policy.livingPct}% · <Link href="/cash" className="underline underline-offset-2">Cash</Link> has the ledger.</div>
          </div>
        </Window>

        {/* Terminal: sync state */}
        <div className="terminal order-last col-span-12 px-[18px] py-4 sm:col-span-6 lg:order-none lg:col-span-3" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="boot-mark" aria-hidden="true">Ledger</div>
          <div className="boot-head"><span className="text-terminal-accent">ledger</span> <span className="text-terminal-dim">1.0.0 · sync</span></div>
          <div className="mt-auto pt-4 text-terminal-accent">$ ledger sync</div>
          {institutions.map((i) => (
            <div key={i.id} className="flex justify-between gap-2">
              <span className="truncate text-terminal-dim">{i.name.split(" ")[0]}</span>
              <span>{i.accounts.length} acct{i.accounts.length === 1 ? "" : "s"} · {i.status === "ok" ? "ok" : i.status === "needs_reauth" ? "reauth" : "error"}</span>
            </div>
          ))}
          {institutions.length === 0 ? <div className="text-terminal-dim">no banks linked</div> : null}
          <div className="mt-1.5 text-terminal-accent">
            {institutions.some((i) => i.lastSyncedAt) ? `last ${WHEN.format(new Date(institutions.map((i) => i.lastSyncedAt).filter(Boolean).sort().at(-1) as string))}` : "never"}
          </div>
        </div>

        {/* Net worth strip */}
        <div className="col-span-12 grid grid-cols-2 gap-[18px] sm:grid-cols-4">
          <Link href="/cash"><StatTile label="Cash" value={formatCents(byRole.get("cash") ?? 0n)} hint={<Trend delta={delta("cash")} />} /></Link>
          <Link href="/savings"><StatTile label="Long-term savings" value={formatCents(byRole.get("long_term_savings") ?? 0n)} hint={<Trend delta={delta("long_term_savings")} />} /></Link>
          <Link href="/investments"><StatTile label="Investments" value={formatCents(byRole.get("investment") ?? 0n)} hint={<Trend delta={delta("investment")} />} /></Link>
          <StatTile label="Net worth" value={formatCents(netWorth)} hint={<Trend delta={hasHistory ? netWorth - netThen : null} />} />
        </div>

        {/* Cash flow */}
        <Window title={`Cash flow · last ${flow.length} months`} className="col-span-12 lg:col-span-7" right="Transfers excluded." style={{ "--i": 4 } as React.CSSProperties} bodyClassName="flex h-[calc(100%-40px)] flex-col px-[22px] pb-[18px] pt-1">
          {flow.length ? (
            <div className="mt-auto">
              <div className="flex items-center gap-4 text-[11.5px] text-ink3">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-[2px] bg-accent" />Income</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-[2px] border border-accent-strong/60" />Spending</span>
              </div>
              <div className="mt-3 grid items-end gap-6 border-b border-line" style={{ gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))`, height: 132 }}>
                {flow.map((m, n) => (
                  <div key={m.month} className="flex h-full items-end justify-center gap-1.5">
                    <div className="grow-y w-full max-w-[34px] rounded-t-[7px] bg-accent" style={{ "--n": n, height: `${Math.max(3, Number((m.income * 128n) / maxFlow))}px` } as React.CSSProperties} title={`income ${formatCents(m.income)}`} />
                    <div className="grow-y w-full max-w-[34px] rounded-t-[7px] border border-b-0 border-accent-strong/60 bg-[var(--accent-soft)]" style={{ "--n": n, height: `${Math.max(3, Number((m.spending * 128n) / maxFlow))}px` } as React.CSSProperties} title={`spending ${formatCents(m.spending)}`} />
                  </div>
                ))}
              </div>
              <div className="mt-2.5 grid gap-6" style={{ gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))` }}>
                {flow.map((m) => (
                  <div key={m.month} className="text-center">
                    <div className="eyebrow inline-flex items-center gap-1.5 !text-ink2">{fmtDate(MONTH_SHORT, m.month).split(" ")[0]} <NetDot net={m.income - m.spending} /></div>
                    <div className="mono num mt-0.5 flex flex-col text-[11px] text-ink3 sm:block sm:text-[11.5px]">
                      <span>+{formatCents(m.income, { sign: "never" }).replace(/\.\d\d$/, "").replace("$", "")}</span><span className="hidden opacity-50 sm:inline"> / </span><span>−{formatCents(m.spending, { sign: "never" }).replace(/\.\d\d$/, "").replace("$", "")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink2">Nothing categorized yet.</p>
          )}
        </Window>

        {/* Recent */}
        <Window title="Recent" className="col-span-12 lg:col-span-5" right={<Link href="/transactions">All</Link>} bodyClassName="px-[22px] pb-4 pt-2" style={{ "--i": 5 } as React.CSSProperties}>
          <ul>
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5 text-[13px] last:border-b-0">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="cat-ico"><CategoryIcon id={t.isInternal ? "internal_transfer" : t.categoryId} /></span>
                  <span className="truncate">
                  <span className="font-semibold">{t.description.length > 28 ? t.description.slice(0, 28) + "…" : t.description}</span>
                  <span className="text-ink3"> · {t.isInternal ? "Transfer" : t.categoryName ?? "Uncategorized"}</span>
                  </span>
                </span>
                <Money cents={t.amount} className="mono text-[12.5px]" />
              </li>
            ))}
            {recent.length === 0 ? <li className="py-2 text-[13px] text-ink2">Nothing yet.</li> : null}
          </ul>
        </Window>

      </div>
    </>
  );
}
