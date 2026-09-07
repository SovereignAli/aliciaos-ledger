import { formatCents, type Cents } from "@/lib/money";
import { netWorthByRoleAt } from "@/lib/queries/overview";
import { investmentYear, listHoldings, listInvestmentTxns } from "@/lib/queries/investments";
import { listAccountsByRole, listCategories, listHiddenAccounts, listTransactions } from "@/lib/queries/transactions";
import { AccountCards } from "../../_components/AccountCards";
import { HiddenAccounts } from "../../_components/HiddenAccounts";
import { DAY, fmtDate, Money } from "../../_components/Money";
import { StatTile } from "../../_components/StatTile";
import { Trend } from "../../_components/Trend";
import { TxnList } from "../../_components/TxnList";
import { Window } from "../../_components/Window";

const idx = (n: number) => ({ "--i": n } as React.CSSProperties);
const SHADES = ["bg-accent-strong", "bg-accent", "bg-accent/70", "bg-accent/45", "bg-[var(--accent-wash)]", "bg-[var(--sidebar-active)]"];

function pctOf(part: Cents, whole: Cents): number {
  return whole > 0n ? Number((part * 1000n) / whole) / 10 : 0;
}
function qty(q: string): string {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}
const KIND: Record<string, string> = { buy: "Bought", sell: "Sold", dividend: "Dividend", interest: "Interest", contribution: "Contribution", deposit: "Deposit", withdrawal: "Withdrawal", fee: "Fee", transfer: "Transfer" };

export default async function InvestmentsPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const year = Number(today.slice(0, 4));
  const monthAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [accounts, holdings, activity, contributions, categories, hidden, yearTotals, then] = await Promise.all([
    listAccountsByRole("investment"),
    listHoldings(),
    listInvestmentTxns(120),
    listTransactions({ group: "investing", limit: 60 }),
    listCategories(),
    listHiddenAccounts(),
    investmentYear(year),
    netWorthByRoleAt(monthAgo),
  ]);
  const total = accounts.reduce((s, a) => s + (a.balance ?? 0n), 0n);
  const retirement = accounts.filter((a) => a.subtype === "ira" || a.subtype === "roth").reduce((s, a) => s + (a.balance ?? 0n), 0n);
  const before = then.get("investment");
  const basis = holdings.reduce((s, h) => s + (h.costBasis ?? 0n), 0n);
  const basisKnown = holdings.some((h) => h.costBasis !== null);
  const held = holdings.reduce((s, h) => s + h.value, 0n);
  const gain = held - basis;
  const sentFromCash = contributions.filter((t) => t.postedAt.startsWith(String(year))).reduce((s, t) => s - t.amount, 0n);
  // Allocation by security across every account.
  const bySec = new Map<string, { label: string; value: Cents }>();
  for (const h of holdings) {
    const k = h.ticker ?? h.name;
    const cur = bySec.get(k) ?? { label: k, value: 0n };
    cur.value += h.value;
    bySec.set(k, cur);
  }
  const alloc = [...bySec.values()].sort((a, b) => (b.value > a.value ? 1 : -1));
  const byAccount = accounts.map((a) => ({ account: a, rows: holdings.filter((h) => h.accountId === a.id) }));

  return (
    <div className="grid grid-cols-12 gap-[18px]">
      <div className="col-span-12 grid grid-cols-2 gap-[18px] sm:grid-cols-4">
        <div style={idx(0)}><StatTile label="Invested" value={formatCents(total)} hint={<Trend delta={before === undefined ? null : total - before} />} /></div>
        <div style={idx(1)}><StatTile label="Retirement" value={formatCents(retirement)} hint="Roth IRA." /></div>
        <div style={idx(2)}><StatTile label={basisKnown ? "Gain" : "Positions"} value={basisKnown ? formatCents(gain, { sign: "always" }) : String(holdings.length)} hint={basisKnown ? `${formatCents(basis)} cost basis.` : "Cost basis not reported."} /></div>
        <div style={idx(3)}><StatTile label={`${year} dividends`} value={formatCents(yearTotals.dividends)} hint={sentFromCash > 0n ? `${formatCents(sentFromCash)} sent from cash.` : "Inside the accounts."} /></div>
      </div>

      <div className="col-span-12 flex flex-col lg:col-span-4">
        <AccountCards accounts={accounts} lead="Retirement and the taxable brokerage the investing bucket feeds." style={idx(4)}>
          {alloc.length ? (
            <div className="mt-5">
              <div className="eyebrow mb-2">Allocation</div>
              <div className="flex h-3 overflow-hidden rounded-full bg-[var(--sidebar-active)]">
                {alloc.map((a, i) => <div key={a.label} className={SHADES[Math.min(i, SHADES.length - 1)]} style={{ width: `${pctOf(a.value, held)}%` }} title={`${a.label} ${formatCents(a.value)}`} />)}
              </div>
              <ul className="mt-2.5 grid gap-1 text-[12.5px]">
                {alloc.slice(0, 6).map((a, i) => (
                  <li key={a.label} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 truncate"><span className={`inline-block h-2 w-2 rounded-[2px] ${SHADES[Math.min(i, SHADES.length - 1)]}`} />{a.label}</span>
                    <span className="mono num text-ink3">{pctOf(a.value, held).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </AccountCards>
        <HiddenAccounts accounts={hidden.filter((h) => h.role === "investment")} />
      </div>

      <Window title="Holdings" right={holdings[0] ? `Prices as of ${fmtDate(DAY, holdings[0].asOf)}.` : "Nothing reported yet."} className="col-span-12 lg:col-span-8" style={idx(5)} bodyClassName="pb-2 pt-3">
        {holdings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow border-b border-line px-[22px] py-2 font-medium">Security</th>
                  <th className="eyebrow border-b border-line px-3 py-2 text-right font-medium">Shares</th>
                  <th className="eyebrow border-b border-line px-3 py-2 text-right font-medium">Price</th>
                  <th className="eyebrow border-b border-line px-3 py-2 text-right font-medium">Value</th>
                  <th className="eyebrow border-b border-line px-[22px] py-2 text-right font-medium">{basisKnown ? "Gain" : "Weight"}</th>
                </tr>
              </thead>
              {byAccount.filter((g) => g.rows.length).map((g) => (
                <tbody key={g.account.id}>
                  <tr className="band bg-[var(--sidebar-active)]">
                    <td colSpan={4} className="px-[22px] py-1.5 text-[12px] font-semibold text-ink2">{g.account.name}</td>
                    <td className="num px-[22px] py-1.5 text-right text-[12px] font-medium text-ink2">{formatCents(g.rows.reduce((s, h) => s + h.value, 0n))}</td>
                  </tr>
                  {g.rows.map((h) => (
                    <tr key={h.id} className="border-t border-line-soft">
                      <td className="px-[22px] py-2.5">
                        <div className="font-semibold">{h.ticker ?? h.name}</div>
                        {h.ticker ? <div className="max-w-[34ch] truncate text-[11.5px] text-ink3" title={h.name}>{h.name}</div> : null}
                      </td>
                      <td className="mono num px-3 py-2.5 text-right text-[12.5px]">{qty(h.quantity)}</td>
                      <td className="mono num px-3 py-2.5 text-right text-[12.5px]">{h.price === null ? "—" : formatCents(h.price)}</td>
                      <td className="num px-3 py-2.5 text-right font-semibold">{formatCents(h.value)}</td>
                      <td className="px-[22px] py-2.5 text-right">
                        {basisKnown && h.costBasis !== null ? <Money cents={h.value - h.costBasis} className="mono text-[12.5px]" /> : <span className="mono num text-[12.5px] text-ink3">{pctOf(h.value, held).toFixed(1)}%</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <p className="px-[22px] py-8 text-center text-[13px] text-ink2">The brokerage has not reported positions yet. They land on the next sync.</p>
        )}
      </Window>

      <Window title="Activity inside the brokerage" right={activity.length ? `${activity.length} recent.` : "Nothing yet."} className="col-span-12 lg:col-span-7" style={idx(6)} bodyClassName="px-[22px] pb-3 pt-1">
        {activity.length ? (
          <ul>
            {activity.slice(0, 40).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2 text-[13px] last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate"><span className="font-semibold">{KIND[t.subtype ?? t.type] ?? t.type}</span>{t.ticker && t.type !== "cash" ? <span className="text-ink2"> {t.ticker}</span> : null}{t.type !== "cash" && Number(t.quantity) ? <span className="mono text-[12px] text-ink3"> · {qty(t.quantity)} sh{t.price ? ` @ ${formatCents(t.price)}` : ""}</span> : null}</div>
                  <div className="text-[11.5px] text-ink3">{fmtDate(DAY, t.postedAt)} · {t.accountName}</div>
                </div>
                <Money cents={t.amount} className="mono text-[12.5px]" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[13px] text-ink2">Buys, dividends and contributions inside the accounts show here once the brokerage reports them.</p>
        )}
      </Window>

      <TxnList txns={contributions} categories={categories} showAccount={false} emptyText="No transfers to the brokerage categorized yet." title="Active contributions" right="What left the bank." className="col-span-12 lg:col-span-5" style={idx(7)} />
    </div>
  );
}
