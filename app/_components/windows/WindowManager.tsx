"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * A registry of the windows on the current page, so the sidebar can list
 * them as files, plus a memory of what each section listed last time, so
 * the tree can collapse one folder while it opens the next.
 */
export interface WinInfo {
  id: string;
  title: string;
  order: number;
}

interface Ctx {
  section: string;
  filesFor: (section: string) => WinInfo[];
  register: (section: string, w: WinInfo) => () => void;
  focus: (id: string) => void;
}

const WindowCtx = createContext<Ctx | null>(null);

export function sectionOf(path: string): string {
  return path.split("/")[1] || "overview";
}

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const section = sectionOf(usePathname());
  const [files, setFiles] = useState<Record<string, WinInfo[]>>({});

  // setFiles is stable, so register is too: a window registers once on mount.
  const register = useCallback((sec: string, w: WinInfo) => {
    setFiles((prev) => ({
      ...prev,
      [sec]: [...(prev[sec] ?? []).filter((p) => p.id !== w.id), w].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }));
    // Unmounting keeps the section's memory: the folder still knows its files while collapsed.
    return () => {};
  }, []);

  const focus = useCallback((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-window="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    el.classList.add("settled");
    el.classList.remove("window-attention");
    void el.offsetWidth;
    el.classList.add("window-attention");
    el.addEventListener("animationend", () => el.classList.remove("window-attention"), { once: true });
  }, []);

  const filesFor = useCallback((sec: string) => files[sec] ?? [], [files]);
  const value = useMemo<Ctx>(() => ({ section, filesFor, register, focus }), [section, filesFor, register, focus]);
  return <WindowCtx.Provider value={value}>{children}</WindowCtx.Provider>;
}

export function useWindowManager(): Ctx {
  const ctx = useContext(WindowCtx);
  if (!ctx) throw new Error("useWindowManager outside WindowManagerProvider");
  return ctx;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
