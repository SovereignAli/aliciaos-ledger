"use client";

import { useTransition } from "react";
import { setAccountHidden } from "@/app/(app)/actions";

export function HiddenAccounts({ accounts }: { accounts: Array<{ id: string; name: string; institutionName: string }> }) {
  const [pending, start] = useTransition();
  if (accounts.length === 0) return null;
  return (
    <details className="mt-4 text-[12.5px] text-ink3">
      <summary className="cursor-pointer list-none">{accounts.length} hidden account{accounts.length === 1 ? "" : "s"}</summary>
      <ul className="mt-2 grid gap-1">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3">
            <span className="truncate">{a.institutionName} · {a.name}</span>
            <button type="button" className="btn btn-quiet px-2 py-0.5 text-[11.5px]" disabled={pending} onClick={() => start(async () => { await setAccountHidden(a.id, false); })}>
              Show
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
