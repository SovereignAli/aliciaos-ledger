"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Popover } from "./Popover";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  hint?: string;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}

/** A three-dot (or any) trigger that opens a small action menu. */
export function Menu({ items, label = "More", trigger, align = "end" }: { items: MenuItem[]; label?: string; trigger?: ReactNode; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button ref={setBtn} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="menu-trigger">
        {trigger ?? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm7-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>
        )}
      </button>
      <Popover anchor={btn} open={open} onClose={close} align={align} className="min-w-[200px]">
        <ul role="menu" className="listbox">
          {items.map((it) => (
            <li
              key={it.label}
              role="menuitem"
              aria-disabled={it.disabled}
              className={`listbox-item ${it.danger ? "is-danger" : ""} ${it.disabled ? "is-disabled" : ""}`}
              onClick={() => {
                if (it.disabled) return;
                close();
                it.onSelect();
              }}
            >
              {it.checked !== undefined ? <span className={`mr-0.5 inline-block h-1.5 w-1.5 rounded-full ${it.checked ? "bg-accent" : "bg-transparent"}`} /> : null}
              <span>{it.label}</span>
              {it.hint ? <span className="ml-auto text-[11px] text-ink3">{it.hint}</span> : null}
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}
