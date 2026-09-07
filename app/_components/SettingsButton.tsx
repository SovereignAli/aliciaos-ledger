"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GearIcon } from "./Icons";

/** A round gear beside the mode pills. Opens Settings, the one section that isn't a folder. */
export function SettingsButton() {
  const active = usePathname().startsWith("/settings");
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      aria-current={active ? "page" : undefined}
      title="Settings"
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${active ? "bg-accent-soft text-accent-strong" : "bg-[var(--sidebar-active)] text-ink3 hover:text-ink"}`}
    >
      <GearIcon className="h-[15px] w-[15px]" />
    </Link>
  );
}
