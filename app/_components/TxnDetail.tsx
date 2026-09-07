import type { TxnView } from "@/lib/queries/transactions";
import { CategoryIcon } from "./HeroIcons";
import { Money, fmtDate } from "./Money";

const FULL = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const SEEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ROLE: Record<TxnView["accountRole"], string> = { cash: "Cash", long_term_savings: "Long-term savings", investment: "Investments", credit: "Credit card", other: "Other" };
const SOURCE: Record<TxnView["source"], string> = { plaid: "Plaid", simplefin: "SimpleFIN", manual: "Entered by hand" };

/** Everything the ledger knows about one transaction. Rendered on the server; the row opens it. */
export function TxnDetail({ t }: { t: TxnView }) {
  const category = t.isInternal ? "Internal transfer" : t.categoryName ?? "Uncategorized";
  const how = t.isInternal
    ? t.isInternalManual ? "marked by you" : "paired automatically"
    : t.categorySource === "manual" ? "set by you" : t.categorySource === "rule" ? "by rule" : t.categorySource === "provider" ? "from the bank" : null;
  const hint = t.providerHint ? t.providerHint.toLowerCase().replace(/_/g, " ") : null;
  return (
    <div className="txn-detail">
      <div className="flex items-start gap-3">
        <span className="cat-ico cat-ico-lg"><CategoryIcon id={t.isInternal ? "internal_transfer" : t.categoryId} /></span>
        <div className="min-w-0 flex-1">
          <div className="break-words text-[14px] font-semibold leading-snug">{t.description}</div>
          <div className="mt-0.5 text-[12px] text-ink3">{t.accountName} · {t.institutionName}</div>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <Money cents={t.amount} className="text-[24px] font-semibold tracking-tight" />
        <span className="flex gap-1.5">
          {t.pending ? <span className="txn-chip text-warn">Pending</span> : <span className="txn-chip">Posted</span>}
          {t.isInternal ? <span className="txn-chip">Transfer</span> : null}
        </span>
      </div>
      <dl className="txn-facts">
        <dt>Date</dt><dd>{fmtDate(FULL, t.postedAt)}</dd>
        <dt>Account</dt><dd>{t.accountName}<span className="text-ink3"> · {ROLE[t.accountRole]}</span></dd>
        <dt>Category</dt><dd>{category}{how ? <span className="text-ink3"> · {how}</span> : null}</dd>
        {t.partner ? (
          <><dt>Other leg</dt><dd>{t.partner.accountName}<span className="text-ink3"> · {fmtDate(FULL, t.partner.postedAt)}</span></dd></>
        ) : t.isInternal ? (
          <><dt>Other leg</dt><dd className="text-ink3">None matched</dd></>
        ) : null}
        {hint ? <><dt>Bank&apos;s label</dt><dd className="capitalize">{hint}</dd></> : null}
        <dt>Source</dt><dd>{SOURCE[t.source]}<span className="text-ink3"> · first seen {SEEN.format(new Date(t.firstSeenAt))}</span></dd>
        {t.externalId ? <><dt>Reference</dt><dd className="mono truncate text-[11.5px]" title={t.externalId}>{t.externalId}</dd></> : null}
      </dl>
    </div>
  );
}
