"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * On phones the sidebar is a drawer, as on alexwil.com: a top bar with only
 * the hamburger, a backdrop, and the same sidebar sliding in from the left.
 * On desktop these wrappers do nothing and the aside sits in the frame as
 * always. Navigating closes it.
 */
export function Drawer({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(path);
  if (path !== seenPath) { setSeenPath(path); setOpen(false); }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="mobile-top-bar lg:hidden">
        <button type="button" className="hamburger" aria-label="Menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </button>
      </div>
      <div className={`drawer-backdrop lg:hidden ${open ? "visible" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="sidebar" className={`sidebar ${open ? "open" : ""}`} aria-label="Primary">
        {children}
      </aside>
    </>
  );
}
