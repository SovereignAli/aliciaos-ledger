"use client";

import { useState, useTransition } from "react";
import { adjustBucket, setSplitPolicy } from "@/app/(app)/actions";
import { DateField } from "./ui/DateField";
import { Select } from "./ui/Select";
import { Tabs } from "./ui/Tabs";
import { Window } from "./Window";

const LONG = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const since = (iso: string) => LONG.format(new Date(`${iso}T00:00:00Z`));

type Policy = { effectiveFrom: string; bufferPct: number; investPct: number; livingPct: number };

/** One window for the two things you occasionally change: the split, and a manual bucket move. */
export function AdjustWindow({ policy, buckets, today, style, className = "" }: { policy: Policy; buckets: Array<{ id: string; name: string }>; today: string; style?: React.CSSProperties; className?: string }) {
  const [tab, setTab] = useState<"split" | "move">("split");
  return (
    <Window title="Adjust" right={tab === "split" ? `Split since ${since(policy.effectiveFrom)}.` : "Manual move."} style={style} className={className} bodyClassName="px-[22px] pb-[22px] pt-1">
      <Tabs value={tab} onChange={setTab} items={[["split", "Split"], ["move", "Move money"]]} />
      <div className="mt-4">{tab === "split" ? <SplitForm policy={policy} today={today} /> : <MoveForm buckets={buckets} today={today} />}</div>
    </Window>
  );
}

function SplitForm({ policy, today }: { policy: Policy; today: string }) {
  const [pending, start] = useTransition();
  const [buffer, setBuffer] = useState(String(policy.bufferPct));
  const [invest, setInvest] = useState(String(policy.investPct));
  const [from, setFrom] = useState(today);
  const [msg, setMsg] = useState<string | null>(null);
  const living = 100 - Number(buffer || 0) - Number(invest || 0);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await setSplitPolicy(buffer, invest, from);
          setMsg(r.ok ? "Saved. Paychecks from that date on use the new split." : r.message ?? "Failed");
        });
      }}
    >
      <div className="grid grid-cols-3 gap-2.5 text-[12.5px] text-ink2">
        <label className="grid gap-1">Buffer %<input className="field num py-1.5" inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} /></label>
        <label className="grid gap-1">Investing %<input className="field num py-1.5" inputMode="decimal" value={invest} onChange={(e) => setInvest(e.target.value)} /></label>
        <div className="grid gap-1">Living %<div className={`num py-1.5 text-[14px] font-semibold ${living < 0 ? "text-negative" : "text-ink"}`}>{living}</div></div>
      </div>
      <label className="grid gap-1 text-[12.5px] text-ink2">Effective from<DateField value={from} onChange={setFrom} /></label>
      <div className="flex items-center gap-3">
        <button className="btn btn-quiet" type="submit" disabled={pending || living < 0}>{pending ? "Saving…" : "Update split"}</button>
        {msg ? <p className="text-[12px] text-ink2">{msg}</p> : null}
      </div>
    </form>
  );
}

function MoveForm({ buckets, today }: { buckets: Array<{ id: string; name: string }>; today: string }) {
  const [pending, start] = useTransition();
  const [bucket, setBucket] = useState(buckets[0]?.id ?? "buffer");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [on, setOn] = useState(today);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await adjustBucket(bucket, amount, direction, note, on);
          if (r.ok) { setAmount(""); setNote(""); setMsg("Recorded."); } else setMsg(r.message ?? "Failed");
        });
      }}
    >
      <p className="text-[12.5px] leading-snug text-ink3">A buffer dip, a top-up by hand, money moved to the brokerage outside payroll. Record it so the balances stay true.</p>
      <div className="grid grid-cols-2 gap-2.5 text-[12.5px] text-ink2">
        <label className="grid gap-1">Bucket<Select fullWidth value={bucket} onChange={setBucket} options={buckets.map((b) => ({ value: b.id, label: b.name }))} /></label>
        <label className="grid gap-1">Direction<Select fullWidth value={direction} onChange={(v) => setDirection(v as "in" | "out")} options={[{ value: "out", label: "Taken out" }, { value: "in", label: "Put in" }]} /></label>
        <label className="grid gap-1">Amount<input className="field num py-1.5" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
        <label className="grid gap-1">On<DateField value={on} onChange={setOn} /></label>
      </div>
      <input className="field py-1.5" placeholder="Note (car repair, etc.)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
      <div className="flex items-center gap-3">
        <button className="btn btn-quiet" type="submit" disabled={pending}>{pending ? "Saving…" : "Record"}</button>
        {msg ? <p className="text-[12px] text-ink2">{msg}</p> : null}
      </div>
    </form>
  );
}
