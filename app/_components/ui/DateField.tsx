"use client";

import { useCallback, useState } from "react";
import { Popover } from "./Popover";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function iso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function fmt(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

/** A date field with the app's own calendar instead of the browser's. */
export function DateField({ value, onChange, name, className = "", ariaLabel = "Date", max, min }: {
  value: string;
  onChange: (iso: string) => void;
  name?: string;
  className?: string;
  ariaLabel?: string;
  max?: string;
  min?: string;
}) {
  const [open, setOpen] = useState(false);
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date().toISOString().slice(0, 10);

  function step(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button ref={setBtn} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`field select-btn num ${className}`}>
        <span>{fmt(value) || "Pick a date"}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="select-chev" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" /></svg>
      </button>
      <Popover anchor={btn} open={open} onClose={close} className="w-[264px]">
        <div className="calendar">
          <div className="flex items-center justify-between px-1 pb-2">
            <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
            <div className="text-[13px] font-semibold">{MONTHS[view.m]} {view.y}</div>
            <button type="button" className="cal-nav" aria-label="Next month" onClick={() => step(1)}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {DOW.map((d, i) => <div key={i} className="eyebrow py-1">{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const v = iso(view.y, view.m, d);
              const disabled = (max !== undefined && v > max) || (min !== undefined && v < min);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  aria-pressed={v === value}
                  className={`cal-day num ${v === value ? "is-selected" : ""} ${v === today ? "is-today" : ""}`}
                  onClick={() => {
                    onChange(v);
                    close();
                    btn?.focus();
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-line-soft pt-2 text-[12px]">
            <button type="button" className="text-ink3 hover:text-ink" onClick={() => { onChange(today); close(); }}>Today</button>
            <button type="button" className="text-ink3 hover:text-ink" onClick={close}>Close</button>
          </div>
        </div>
      </Popover>
    </>
  );
}
