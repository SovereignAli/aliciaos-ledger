"use client";

import { useSyncExternalStore } from "react";
import { AutoIcon, MoonIcon, SunIcon } from "./Icons";

type Theme = "system" | "light" | "dark";
const KEY = "aliciaos-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function write(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
  listeners.forEach((cb) => cb());
}

/** The site's mode pills: light, dark, and auto in place of its Alex mode. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const items: Array<[Theme, string, React.ReactNode]> = [
    ["light", "Light", <SunIcon key="s" className="ico" />],
    ["dark", "Dark", <MoonIcon key="m" className="ico" />],
    ["system", "Auto", <AutoIcon key="a" className="ico" />],
  ];
  return (
    <div className="mode-pills" role="radiogroup" aria-label="Color theme">
      {items.map(([v, l, icon]) => (
        <button key={v} type="button" role="radio" aria-checked={theme === v} aria-label={`${l} mode`} title={l} className={`mode-pill ${theme === v ? "active" : ""}`} onClick={() => write(v)}>
          {icon}
        </button>
      ))}
    </div>
  );
}
