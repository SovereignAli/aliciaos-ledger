import { formatCents, type Cents } from "@/lib/money";

/* Same three depths as BucketBar, so the ring and the bar read as one chart. */
const STROKE: Record<string, string> = {
  buffer: "var(--accent-strong)",
  investing: "var(--accent)",
  free: "var(--accent-wash)",
};

/** A ring of the split. Segments sweep in one after another; the label sits inside. */
export function Donut({ segments, total, label, value, size = 168 }: { segments: Array<{ id: string; name: string; value: Cents }>; total: Cents; label: string; value: string; size?: number }) {
  const arcs = segments
    .filter((s) => s.value > 0n)
    .reduce<Array<{ id: string; name: string; value: Cents; pct: number; offset: number; n: number }>>((acc, s, n) => {
      const pct = total > 0n ? Number((s.value * 10000n) / total) / 100 : 0;
      const offset = acc.reduce((sum, a) => sum + a.pct, 0);
      acc.push({ ...s, pct, offset, n });
      return acc;
    }, []);
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label} ${value}`} className="-rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--sidebar-active)" strokeWidth="12" />
        {arcs.map((a) => (
          <circle
            key={a.id}
            className="donut-seg"
            cx="50" cy="50" r="40" fill="none"
            pathLength={100}
            stroke={STROKE[a.id] ?? "var(--accent)"}
            strokeWidth="12"
            strokeDasharray={`${a.pct} 100`}
            strokeDashoffset={-a.offset}
            style={{ "--d": `${Math.round(a.pct * 11)}ms`, "--o": `${Math.round(a.offset * 11)}ms` } as React.CSSProperties}
          >
            <title>{`${a.name} ${formatCents(a.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="fade-late absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="eyebrow">{label}</div>
        <div className="num font-display text-[20px] font-medium leading-tight">{value}</div>
      </div>
    </div>
  );
}
