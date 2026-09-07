"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "./Popover";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  hint?: string;
  icon?: React.ReactNode;
}

/**
 * A select in the app's materials: a field that opens a listbox popover.
 * Keyboard: arrows move, Enter picks, Escape closes, typing jumps.
 */
export function Select({ value, options, onChange, placeholder = "Choose…", name, className = "", disabled, size = "md", ariaLabel, fullWidth = false, variant = "field" }: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  /** Fill the field's column (forms). Otherwise the trigger fits its label with room to breathe. */
  fullWidth?: boolean;
  /** "quiet" is a text-only trigger for inline use, a label with a chevron and no box. */
  variant?: "field" | "quiet";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const l = list.current;
    const el = l?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!l || !el) return;
    const top = el.offsetTop - l.offsetTop;
    if (top < l.scrollTop) l.scrollTop = top;
    else if (top + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = top + el.offsetHeight - l.clientHeight;
  }, [open, active]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    btn?.focus();
  }
  function onKey(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[active]) pick(options[active].value); }
    else if (e.key.length === 1) {
      const i = options.findIndex((o, idx) => idx > active && o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (j >= 0) setActive(j);
    }
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={setBtn}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        className={variant === "quiet"
          ? `select-quiet ${current ? "" : "text-warn"} ${className}`
          : `field select-btn ${size === "sm" ? "select-sm" : ""} ${fullWidth ? "w-full" : "w-auto"} ${current ? "" : "text-ink3"} ${className}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">{variant === "quiet" ? null : current?.icon}<span className={fullWidth ? "truncate" : "whitespace-nowrap"}>{current?.label ?? placeholder}</span></span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="select-chev" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" /></svg>
      </button>
      <Popover anchor={btn} open={open} onClose={close} width={fullWidth ? "anchor" : undefined} className="min-w-[220px] max-w-[320px]">
        <ul ref={list} role="listbox" className="listbox" onKeyDown={onKey} tabIndex={-1}>
          {groups.map((g) => (
            <li key={g || "_"} role="presentation">
              {g ? <div className="listbox-group">{g}</div> : null}
              <ul role="group">
                {options.map((o, idx) => (o.group ?? "") === g ? (
                  <li
                    key={o.value}
                    role="option"
                    aria-selected={o.value === value}
                    data-index={idx}
                    className={`listbox-item ${idx === active ? "is-active" : ""} ${o.value === value ? "is-selected" : ""}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => pick(o.value)}
                  >
                    {o.icon}<span className="truncate">{o.label}</span>
                    {o.hint ? <span className="ml-auto text-[11px] text-ink3">{o.hint}</span> : null}
                    {o.value === value ? <svg viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" /></svg> : null}
                  </li>
                ) : null)}
              </ul>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}
