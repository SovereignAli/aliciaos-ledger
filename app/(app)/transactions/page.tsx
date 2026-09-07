import { Suspense } from "react";
import { listAccountsByRole, listCategories, listTransactions } from "@/lib/queries/transactions";
import type { Role } from "@/lib/queries/overview";
import { fmtDate, MONTH_SHORT } from "../../_components/Money";
import { TxnFilters } from "../../_components/TxnFilters";
import { TxnList } from "../../_components/TxnList";
import { Window } from "../../_components/Window";

const ROLES: Role[] = ["cash", "long_term_savings", "investment", "credit", "other"];

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const accountId = pick("account");
  const categoryId = pick("category");
  const month = pick("month");
  const search = pick("q");
  const role = ROLES.find((r) => r === pick("role"));
  const includeInternal = pick("internal") === "1";

  const [txns, categories, accounts, allMonths] = await Promise.all([
    listTransactions({ accountId, categoryId, month, role, includeInternal, search, limit: 400 }),
    listCategories(),
    listAccountsByRole(),
    listTransactions({ includeInternal: true, limit: 2000 }).then((all) => [...new Set(all.map((t) => t.postedAt.slice(0, 7)))]),
  ]);

  return (
    <div className="grid gap-[18px]">
      <Window title="Transactions" right={`${txns.length} shown.`} style={{ "--i": 0 } as React.CSSProperties} bodyClassName="px-[22px] pb-4 pt-1">
        <Suspense>
          <TxnFilters
            accounts={accounts.map((a) => ({ value: a.id, label: `${a.institutionName} · ${a.name}` }))}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            months={allMonths.map((m) => ({ value: m, label: fmtDate(MONTH_SHORT, m) }))}
          />
        </Suspense>
      </Window>
      <TxnList txns={txns} categories={categories} groupBy="day" emptyText="Nothing matches those filters." style={{ "--i": 1 } as React.CSSProperties} />
    </div>
  );
}
