import { formatCents, type Cents } from "@/lib/money";

/* One hue, three depths: the split reads as one system, not three flags. */
const COLORS: Record<string, string> = {
  buffer: "bg-accent-strong",
  investing: "bg-accent",
  free: "bg-[var(--accent-wash)]",
};
const TEXT: Record<string, string> = { buffer: "text-ink", investing: "text-ink", free: "text-ink" };

/** One stacked bar for the whole cash balance: what each bucket holds, then what's free. */
export function BucketBar({ segments, total, legend = true, amounts = true }: { segments: Array<{ id: string; name: string; value: Cents }>; total: Cents; legend?: boolean; amounts?: boolean }) {
  const visible = segments.filter((s) => s.value > 0n);
  return (
    <div className="grid gap-2.5">
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--sidebar-active)]">
        <div className="grow-x flex w-full">
        {total > 0n
          ? visible.map((s) => <div key={s.id} className={COLORS[s.id] ?? "bg-accent"} style={{ width: `${Number((s.value * 1000n) / total) / 10}%` }} title={`${s.name} ${formatCents(s.value)}`} />)
          : null}
        </div>
      </div>
      {legend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap text-[12px] text-ink2">
          {segments.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-[2px] ${COLORS[s.id] ?? "bg-accent"}`} />
              <span className={TEXT[s.id]}>{s.name}</span>
              {amounts ? <span className="mono num text-ink3">{formatCents(s.value)}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
