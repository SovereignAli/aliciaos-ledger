"use client";

import { useActionState, useState } from "react";
import { addAccount, type ActionState } from "@/app/actions";
import type { AccountOption } from "@/lib/queries/income";
import { Select } from "./ui/Select";

const initial: ActionState = { ok: true, message: null };

const SUBTYPES: { value: string; label: string; type: string }[] = [
  { value: "checking", label: "Checking", type: "depository" },
  { value: "savings", label: "Savings", type: "depository" },
  { value: "hysa", label: "High-yield savings", type: "depository" },
  { value: "brokerage", label: "Brokerage", type: "investment" },
  { value: "ira", label: "Traditional IRA", type: "investment" },
  { value: "roth", label: "Roth IRA", type: "investment" },
  { value: "other", label: "Other", type: "depository" },
];

/** Manual accounts: for money no bank feed can see. Lives under Settings. */
export function AddAccountForm({ accounts }: { accounts: AccountOption[]; open?: boolean }) {
  const [state, action, pending] = useActionState(addAccount, initial);
  const [subtype, setSubtype] = useState("checking");
  const type = SUBTYPES.find((s) => s.value === subtype)?.type ?? "depository";

  return (
    <div className="grid gap-3">
      {accounts.length ? (
        <ul className="grid gap-1.5 text-[13.5px]">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-line-soft pb-1.5 last:border-b-0">
              <span>{a.name}</span>
              <span className="text-[11.5px] text-ink3">{SUBTYPES.find((s) => s.value === a.subtype)?.label ?? a.subtype}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink2">None yet. One holds hand-entered income the banks cannot see.</p>
      )}
      <form action={action} className="grid grid-cols-[1fr_auto_auto] gap-2">
        <input className="field" name="name" placeholder="Account name" maxLength={80} required />
        <Select name="subtype" value={subtype} onChange={setSubtype} options={SUBTYPES.map((s) => ({ value: s.value, label: s.label }))} className="min-w-[150px]" />
        <input type="hidden" name="type" value={type} />
        <button className="btn btn-quiet whitespace-nowrap" type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
        {state.message ? <p role="status" className={`col-span-3 text-[13px] leading-snug ${state.ok ? "text-ink2" : "text-crit"}`}>{state.message}</p> : null}
      </form>
    </div>
  );
}
