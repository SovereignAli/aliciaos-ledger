"use client";

import { HeroIcon } from "./HeroIcons";

/** A small text action with its icon: Settle, Mark owed, Delete, Edit. */
export function IconAction({ icon, children, className = "", ...rest }: { icon: string; children: React.ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`inline-flex items-center gap-1 text-ink3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50 ${className}`}>
      <HeroIcon name={icon} className="h-[13px] w-[13px] opacity-80" />
      {children}
    </button>
  );
}
