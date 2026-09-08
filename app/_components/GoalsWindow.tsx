"use client";

import { useState, useTransition } from "react";
import { closeGoal, createGoal, updateGoal } from "@/app/(app)/actions";
import { formatCents, type Cents } from "@/lib/money";
import type { BucketBalance } from "@/lib/queries/buckets";
import { BucketIcon } from "./HeroIcons";
import { DAY, fmtDate } from "./Money";
import { DateField } from "./ui/DateField";
import { Window } from "./Window";

const dollars = (c: Cents | null) => (c === null ? "" : formatCents(c, { sign: "never" }).replace("$", ""));
const short = (c: Cents) => formatCents(c, { sign: "never" }).replace(/\.\d\d$/, "");

/**
 * Goals: a budget for one specific thing. Each is a bucket held in savings,
 * so the moment it is funded that money stops counting as free. Fund it by
 * hand from the Cash page, or give it a slice of every paycheck.
 */
export function GoalsWindow({ goals, today, style, className = "" }: { goals: BucketBalance[]; today: string; style?: React.CSSProperties; className?: string }) {
  const [adding, setAdding] = useState(goals.length === 0);
  const parked = goals.reduce((s, g) => s + g.held, 0n);
  return (
    <Window title="Goals" right={goals.length ? `${formatCents(parked)} parked.` : "Save for one thing."} style={style} className={className} bodyClassName="px-[22px] pb-4 pt-1">
      <p className="text-[13px] leading-relaxed text-ink2">A trip, a laptop, a deposit. Money put toward a goal sits in savings and stops counting as free. When it is spent, record it on the Cash page under Move money.</p>
      {goals.length ? (
        <ul className="mt-3">
          {goals.map((g) => <GoalRow key={g.id} goal={g} today={today} />)}
        </ul>
      ) : null}
      {adding ? (
        <NewGoalForm today={today} onDone={() => setAdding(false)} cancellable={goals.length > 0} />
      ) : (
        <button type="button" className="pill pill-quiet mt-3 text-[12px]" onClick={() => setAdding(true)}>New goal</button>
      )}
    </Window>
  );
}

function GoalRow({ goal, today }: { goal: BucketBalance; today: string }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(dollars(goal.target));
  const [due, setDue] = useState(goal.dueOn ?? "");
  const [slice, setSlice] = useState(goal.perPaycheck > 0n ? dollars(goal.perPaycheck) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const pct = goal.target && goal.target > 0n ? Math.min(100, Number((goal.held * 100n) / goal.target)) : goal.held > 0n ? 100 : 0;
  const done = goal.target !== null && goal.held >= goal.target;
  const left = goal.target !== null ? goal.target - goal.held : null;
  const paychecksLeft = left !== null && left > 0n && goal.perPaycheck > 0n ? Number((left + goal.perPaycheck - 1n) / goal.perPaycheck) : null;
  const overdue = goal.dueOn !== null && goal.dueOn < today && !done;

  const detail = done
    ? "Funded."
    : [
        goal.target !== null ? `${short(left!)} to go` : null,
        goal.perPaycheck > 0n ? `${short(goal.perPaycheck)} a paycheck${paychecksLeft ? `, about ${paychecksLeft} more` : ""}` : "funded by hand",
        goal.dueOn ? `${overdue ? "was due" : "by"} ${fmtDate(DAY, goal.dueOn)}` : null,
      ].filter(Boolean).join(" · ");

  return (
    <li className="border-b border-line-soft py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="cat-ico"><BucketIcon id={goal.id} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 flex-1 truncate font-semibold">{goal.name}</span>
            <span className="mono num shrink-0 text-[12.5px]">
              <span className={done ? "text-positive" : "text-ink"}>{formatCents(goal.held, { sign: "never" })}</span>
              {goal.target !== null ? <span className="text-ink3"> / {formatCents(goal.target, { sign: "never" })}</span> : null}
            </span>
          </div>
          <div className="bar mt-1.5"><div className={done ? "bg-positive" : overdue ? "bg-warn" : "bg-accent"} style={{ width: `${pct}%` }} /></div>
          <div className={`mt-1 text-[11.5px] leading-snug ${overdue ? "text-warn" : "text-ink3"}`}>{detail}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-[12px]">
          <button type="button" className="text-ink3 hover:text-ink" onClick={() => setEditing((v) => !v)}>{editing ? "Cancel" : "Edit"}</button>
          <button type="button" className="text-ink3 hover:text-negative" disabled={pending} onClick={() => { if (confirm(`Close "${goal.name}"? Anything it still holds goes back to unassigned savings.`)) start(async () => { const r = await closeGoal(goal.id); if (!r.ok) setMsg(r.message ?? "Failed"); }); }}>Close</button>
        </div>
      </div>
      {editing ? (
        <form
          className="mt-3 grid grid-cols-3 gap-2.5 pl-[38px] text-[12.5px] text-ink2"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            start(async () => {
              const r = await updateGoal(goal.id, target, due, slice);
              if (r.ok) setEditing(false);
              else setMsg(r.message ?? "Failed");
            });
          }}
        >
          <label className="grid gap-1">Target $<input className="field num py-1.5" inputMode="decimal" value={target} placeholder="none" onChange={(e) => setTarget(e.target.value)} /></label>
          <label className="grid gap-1">Per paycheck $<input className="field num py-1.5" inputMode="decimal" value={slice} placeholder="0" onChange={(e) => setSlice(e.target.value)} /></label>
          <label className="grid gap-1">By<DateField value={due} onChange={setDue} /></label>
          <div className="col-span-3 flex items-center gap-3">
            <button className="btn btn-quiet" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            {msg ? <span className="text-[12px] text-negative">{msg}</span> : null}
          </div>
        </form>
      ) : msg ? (
        <div className="mt-1 pl-[38px] text-[11.5px] text-negative">{msg}</div>
      ) : null}
    </li>
  );
}

function NewGoalForm({ today, onDone, cancellable }: { today: string; onDone: () => void; cancellable: boolean }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [due, setDue] = useState("");
  const [slice, setSlice] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  void today;
  return (
    <form
      className="mt-4 grid gap-2.5 text-[12.5px] text-ink2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await createGoal(name, target, due, slice);
          if (r.ok) { setName(""); setTarget(""); setDue(""); setSlice(""); onDone(); }
          else setMsg(r.message ?? "Failed");
        });
      }}
    >
      <label className="grid gap-1">What for<input className="field py-1.5" placeholder="Trip to Lisbon" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus /></label>
      <div className="grid grid-cols-3 gap-2.5">
        <label className="grid gap-1">Target $<input className="field num py-1.5" inputMode="decimal" placeholder="2,000" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label className="grid gap-1">Per paycheck $<input className="field num py-1.5" inputMode="decimal" placeholder="0" value={slice} onChange={(e) => setSlice(e.target.value)} /></label>
        <label className="grid gap-1">By<DateField value={due} onChange={setDue} /></label>
      </div>
      <p className="text-[11.5px] leading-snug text-ink3">Leave the paycheck slice at 0 to fund it by hand. Leave the target empty for an open-ended pot.</p>
      <div className="flex items-center gap-3">
        <button className="btn btn-quiet" type="submit" disabled={pending || name.trim().length < 2}>{pending ? "Saving…" : "Create goal"}</button>
        {cancellable ? <button type="button" className="text-[12px] text-ink3 hover:text-ink" onClick={onDone}>Cancel</button> : null}
        {msg ? <span className="text-[12px] text-negative">{msg}</span> : null}
      </div>
    </form>
  );
}
