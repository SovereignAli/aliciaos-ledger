"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Select, type SelectOption } from "./ui/Select";

/**
 * Chips above the feed. Each change lands in the URL at once, so a filtered
 * view is a link you can come back to. Search waits a beat for typing to stop.
 */
export function TxnFilters({ accounts, categories, months }: { accounts: SelectOption[]; categories: SelectOption[]; months: SelectOption[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const [q, setQ] = useState(get("q"));

  function set(k: string, v: string) {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${path}${next.size ? "?" + next.toString() : ""}`, { scroll: false });
  }
  useEffect(() => {
    if (q === get("q")) return;
    const t = window.setTimeout(() => set("q", q.trim()), 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active: Array<[string, string]> = [];
  for (const [k, list] of [["account", accounts], ["category", categories], ["month", months]] as const) {
    const v = get(k);
    if (v) active.push([k, list.find((o) => o.value === v)?.label ?? v]);
  }
  if (get("internal") === "1") active.push(["internal", "Including internal"]);
  if (get("q")) active.push(["q", `“${get("q")}”`]);

  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="relative col-span-2 sm:col-span-1">
          <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-[13px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink3" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" /></svg>
          <input className="field chip chip-search w-full sm:w-auto" placeholder="Search descriptions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </label>
        <Select size="sm" className="chip w-full sm:w-auto" value={get("account")} onChange={(v) => set("account", v)} options={[{ value: "", label: "All accounts" }, ...accounts]} />
        <Select size="sm" className="chip w-full sm:w-auto" value={get("category")} onChange={(v) => set("category", v)} options={[{ value: "", label: "All categories" }, { value: "uncategorized", label: "Uncategorized" }, ...categories]} />
        <Select size="sm" className="chip w-full sm:w-auto" value={get("month")} onChange={(v) => set("month", v)} options={[{ value: "", label: "All months" }, ...months]} />
        <button type="button" className={`chip-toggle w-full justify-center sm:w-auto ${get("internal") === "1" ? "is-on" : ""}`} aria-pressed={get("internal") === "1"} onClick={() => set("internal", get("internal") === "1" ? "" : "1")}>
          Internal transfers
        </button>
      </div>
      {active.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink3">
          {active.map(([k, label]) => (
            <button key={k} type="button" className="pill pill-quiet gap-1.5 py-1 text-[11.5px]" onClick={() => { if (k === "q") setQ(""); set(k, ""); }} aria-label={`Remove filter ${label}`}>
              {label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="ml-1 hover:text-ink" onClick={() => { setQ(""); router.replace(path, { scroll: false }); }}>Clear all</button>
        </div>
      ) : null}
    </div>
  );
}
