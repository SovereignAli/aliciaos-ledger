import { bucketHistory, bucketOverview, heldAccount, listBucketEntries, listPaychecks } from "@/lib/queries/buckets";
import { cashFlowByMonth } from "@/lib/queries/overview";
import { listAccountsByRole, listCategories, listHiddenAccounts, listTransactions } from "@/lib/queries/transactions";
import { AccountCards } from "../../_components/AccountCards";
import { BucketsPanel } from "../../_components/BucketsPanel";
import { HiddenAccounts } from "../../_components/HiddenAccounts";
import { TxnList } from "../../_components/TxnList";

export default async function CashPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const [accounts, txns, categories, hidden, overview, paychecks, entries, history, account, flow] = await Promise.all([
    listAccountsByRole("cash"),
    listTransactions({ role: "cash", includeInternal: true, limit: 200 }),
    listCategories(),
    listHiddenAccounts(),
    bucketOverview(today),
    listPaychecks(24),
    listBucketEntries(40),
    bucketHistory(),
    heldAccount(),
    cashFlowByMonth(4),
  ]);
  // Average of the last three completed months of spending; the current month is partial.
  const done = flow.filter((m) => m.month < today.slice(0, 7) && m.spending > 0n);
  const avgSpend = done.length ? done.reduce((s, m) => s + m.spending, 0n) / BigInt(done.length) : 0n;

  return (
    <div className="grid grid-cols-12 gap-[18px]">
      <div className="col-span-12 flex flex-col lg:col-span-4">
        <AccountCards accounts={accounts} lead="Checking and savings. Payroll lands here and the buckets are held in savings; checking is what the cards and day-to-day pulls draw from. Together they are the cash the buckets divide." style={{ "--i": 1 } as React.CSSProperties} />
        <HiddenAccounts accounts={hidden.filter((h) => h.role === "cash")} />
      </div>
      <BucketsPanel overview={overview} paychecks={paychecks} entries={entries} history={history} today={today} account={account} avgSpend={avgSpend} />
      <TxnList txns={txns} categories={categories} title="Activity" right="Internal transfers dimmed." className="col-span-12" style={{ "--i": 6 } as React.CSSProperties} />
    </div>
  );
}
