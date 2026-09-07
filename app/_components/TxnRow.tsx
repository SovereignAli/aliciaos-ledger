"use client";

import { useState, type ReactNode } from "react";
import { Popover } from "./ui/Popover";

/**
 * A transaction row you can open. Click anywhere that isn't already a control
 * and the row's detail card appears beside it (a sheet on phones). It closes
 * on an outside tap, Escape, or the first scroll, so the list stays scrollable.
 */
export function TxnRow({ as, className = "", children, detail, label }: {
  as: "tr" | "li";
  className?: string;
  children: ReactNode;
  detail: ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [el, setEl] = useState<HTMLElement | null>(null);

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("button, a, input, select, textarea, [role='listbox']")) return;
    setOpen((o) => !o);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
  };
  const props = {
    ref: setEl as (n: HTMLElement | null) => void,
    className: `txn-row ${open ? "is-open" : ""} ${className}`,
    onClick,
    onKeyDown: onKey,
    tabIndex: 0,
    "aria-label": label,
    "aria-expanded": open,
  };
  const pop = (
    <Popover anchor={el} open={open} onClose={() => setOpen(false)} className="txn-sheet w-[min(380px,calc(100vw-24px))]">
      {detail}
    </Popover>
  );
  return as === "tr"
    ? <tr {...props}>{children}{pop}</tr>
    : <li {...props}>{children}{pop}</li>;
}
