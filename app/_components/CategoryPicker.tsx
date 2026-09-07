"use client";

import { useState, useTransition } from "react";
import { setTxnCategory, setTxnInternal } from "@/app/(app)/actions";
import type { CategoryOption } from "@/lib/queries/transactions";
import { CategoryIcon } from "./HeroIcons";
import { Select } from "./ui/Select";

const GROUP_LABEL: Record<string, string> = {
  income: "Income",
  passive_income: "Passive income",
  transfer: "Transfers",
  debt: "Debt",
  investing: "Investing",
  spending: "Spending",
};

/**
 * Pick a category and it applies at once. Then, for a beat, the row offers
 * to turn that choice into a rule for every matching description.
 */
export function CategoryPicker({ txnId, categoryId, source, isInternal, categories, description }: {
  txnId: string;
  categoryId: string | null;
  source: string | null;
  isInternal: boolean;
  categories: CategoryOption[];
  description?: string;
}) {
  const [pending, start] = useTransition();
  const [offer, setOffer] = useState<string | null>(null); // category id just applied, awaiting the rule decision
  const [note, setNote] = useState<string | null>(null);
  const current = isInternal ? "internal_transfer" : (categoryId ?? "");
  const short = (description ?? "").length > 26 ? (description ?? "").slice(0, 26) + "…" : description;

  function apply(next: string, makeRule: boolean) {
    setNote(null);
    if (!makeRule && next !== "internal_transfer") setOffer(next);
    start(async () => {
      const r = next === "internal_transfer" ? await setTxnInternal(txnId, true) : await setTxnCategory(txnId, next, makeRule);
      const message = "message" in r && typeof r.message === "string" ? r.message : null;
      if (!r.ok) { setNote(message ?? "Could not save."); setOffer(null); return; }
      if (makeRule) { setOffer(null); setNote("Rule saved."); window.setTimeout(() => setNote(null), 2200); }
    });
  }

  return (
    <div className="grid gap-1.5">
      {/* A quiet line under the description: the glyph beside the row already says what kind
          of transaction it is, so the control only needs to read as a label you can change. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-tight text-ink3">
        <Select
          ariaLabel="Category"
          variant="quiet"
          value={current}
          placeholder="Uncategorized"
          disabled={pending}
          options={categories.map((c) => ({ value: c.id, label: c.name, group: GROUP_LABEL[c.group] ?? c.group, icon: <CategoryIcon id={c.id} className="h-3.5 w-3.5 shrink-0 text-ink3" /> }))}
          onChange={(next) => {
            if (!next || next === current) return;
            apply(next, false);
          }}
        />
        {source ? <span className="hidden text-ink3/80 sm:inline">· {source === "manual" ? "set by you" : source === "rule" ? "by rule" : "from bank"}</span> : null}
        {isInternal ? (
          <button type="button" className="whitespace-nowrap text-ink3 transition-colors hover:text-ink" disabled={pending} onClick={() => start(async () => { await setTxnInternal(txnId, false); })} title="Treat this as a real transaction, not the other leg of a transfer">
            × Not a transfer
          </button>
        ) : null}
        {note ? <span className={note.startsWith("Rule") ? "text-ink3" : "text-negative"}>{note}</span> : null}
      </div>
      {offer ? (
        <div className="rule-offer">
          <span className="truncate">Use for every <span className="mono text-ink">“{short}”</span>?</span>
          <button type="button" className="rule-yes" disabled={pending} onClick={() => apply(offer, true)}>Make a rule</button>
          <button type="button" className="rule-no" disabled={pending} onClick={() => setOffer(null)}>Just this one</button>
        </div>
      ) : null}
    </div>
  );
}
