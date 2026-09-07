"use client";

import { useState, useTransition } from "react";
import { setBudgetTarget } from "@/app/(app)/actions";
import { formatCents, type Cents } from "@/lib/money";
import { CategoryIcon } from "./HeroIcons";

/**
 * One category this month: spent against its target, with the target editable
 * in place. No target yet: the three-month average is offered as a one-click seed.
 */
export function BudgetRow({ categoryId, name, spent, target, avg3, month, dayFraction }: {
  categoryId: string; name: string; spent: Cents; target: Cents | null; avg3: Cents; month: string; dayFraction: number;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(target === null ? "" : formatCents(target, { sign: "never" }).replace("$", ""));
  const [error, setError] = useState<string | null>(null);
  const editable = categoryId !== "uncategorized";
  const pct = target && target > 0n ? Number((spent * 100n) / target) : null;
  const over = pct !== null && pct > 100;
  const pace = pct !== null && !over && pct > dayFraction * 100 + 10; // ahead of the calendar
  const tone = over ? "bg-negative" : pace ? "bg-warn" : "bg-accent";

  function save(dollars: string) {
    setError(null);
    start(async () => {
      const r = await setBudgetTarget(categoryId, month, dollars);
      if (!r.ok) setError(r.message ?? "Failed");
      else setEditing(false);
    });
  }

  return (
    <li className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[auto_1fr_auto]">
      <span className="cat-ico"><CategoryIcon id={categoryId} /></span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{name}</span>
          <span className="mono num shrink-0 whitespace-nowrap text-[12.5px]">
            <span className={over ? "text-negative" : "text-ink"}>{formatCents(spent, { sign: "never" })}</span>
            {target !== null ? <span className="text-ink3"> / {formatCents(target, { sign: "never" })}</span> : null}
          </span>
        </div>
        <div className="bar mt-1.5"><div className={tone} style={{ width: `${Math.min(100, pct ?? (spent > 0n ? 100 : 0))}%`, opacity: pct === null ? 0.35 : 1 }} /></div>
      </div>
      <div className="col-span-2 pl-[38px] text-left sm:col-span-1 sm:w-[118px] sm:pl-0 sm:text-right">
        {!editable ? (
          <span className="text-[11.5px] text-ink3">Categorize first.</span>
        ) : editing ? (
          <form className="flex items-center justify-end gap-1" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
            <span className="text-ink3">$</span>
            <input autoFocus className="field num w-[84px] py-1 text-right text-[12.5px]" inputMode="decimal" value={draft} placeholder="0.00" onChange={(e) => setDraft(e.target.value)} onBlur={() => save(draft)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }} disabled={pending} />
          </form>
        ) : target !== null ? (
          <button type="button" className="text-[12px] text-ink3 hover:text-ink" onClick={() => setEditing(true)}>Edit target</button>
        ) : avg3 > 0n ? (
          <button type="button" className="pill pill-quiet py-1 text-[11.5px]" disabled={pending} onClick={() => { setDraft(formatCents(avg3, { sign: "never" }).replace("$", "")); save(formatCents(avg3, { sign: "never" }).replace("$", "")); }} title="Three-month average">
            Set {formatCents(avg3, { sign: "never" }).replace(/\.\d\d$/, "")}
          </button>
        ) : (
          <button type="button" className="text-[12px] text-ink3 hover:text-ink" onClick={() => setEditing(true)}>Set target</button>
        )}
        {error ? <div className="text-[11px] text-negative">{error}</div> : null}
      </div>
    </li>
  );
}
