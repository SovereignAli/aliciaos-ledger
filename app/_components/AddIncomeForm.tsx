"use client";

import { useActionState, useState } from "react";
import { addIncomeEntry, type ActionState } from "@/app/actions";
import type { AccountOption } from "@/lib/queries/income";
import { DateField } from "./ui/DateField";
import { Select } from "./ui/Select";

const initial: ActionState = { ok: true, message: null };

export function AddIncomeForm({ accounts, today }: { accounts: AccountOption[]; today: string }) {
  const [state, action, pending] = useActionState(addIncomeEntry, initial);
  const [date, setDate] = useState(today);
  const [account, setAccount] = useState("");
  const depository = accounts.filter((a) => a.type === "depository");
  const choices = depository.length ? depository : accounts;

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="direction" value="in" />
      <div className="grid gap-3">
        <label className="grid gap-1 text-[12.5px] text-ink2">
          Date
          <DateField name="date" value={date} onChange={setDate} />
        </label>
        <label className="grid gap-1 text-[12.5px] text-ink2">
          Amount
          <input
            className="field num"
            name="amount"
            inputMode="decimal"
            placeholder="1,850.00"
            pattern="^\$?\s*[0-9][0-9,]*(\.[0-9]{0,2})?$|^\$?\s*\.[0-9]{1,2}$"
            title="Dollars and cents, no sign"
            required
          />
        </label>
        <label className="grid gap-1 text-[12.5px] text-ink2">
          Description
          <input className="field" name="description" placeholder="CCNY ACH payroll" maxLength={200} required />
        </label>
        <label className="grid gap-1 text-[12.5px] text-ink2">
          Into account
          <Select fullWidth name="account" value={account || (choices[0]?.externalId ?? "")} onChange={setAccount} options={choices.map((a) => ({ value: a.externalId, label: a.institutionName === "Manual" ? a.name : `${a.institutionName} · ${a.name}` }))} />
        </label>
        <button className="btn mt-1" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save entry"}
        </button>
        {state.message ? (
          <p role="status" className={`text-[13px] leading-snug ${state.ok ? "text-ink2" : "text-crit"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
