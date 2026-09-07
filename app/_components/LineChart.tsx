import { formatCents, type Cents } from "@/lib/money";

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * A balance line over time. Stepped between snapshots (a balance holds until
 * the next reading), area under it, min and max called out, first and last
 * dates on the axis. Scales with its container.
 */
export function LineChart({ points, height = 180, className = "" }: { points: Array<{ asOf: string; current: Cents }>; height?: number; className?: string }) {
  const W = 600;
  const H = height;
  const padL = 8, padR = 8, padT = 18, padB = 22;
  if (points.length < 2) {
    return <div className={`flex h-[${height}px] items-center justify-center text-[13px] text-ink3 ${className}`}>A snapshot lands on every sync. Give it a few days.</div>;
  }
  const t0 = Date.parse(points[0].asOf), t1 = Date.parse(points[points.length - 1].asOf);
  const vals = points.map((p) => Number(p.current));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || Math.max(1, hi * 0.05);
  const x = (iso: string) => padL + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - (lo - span * 0.1)) / (span * 1.2)) * (H - padT - padB);
  let d = `M${x(points[0].asOf)},${y(vals[0])}`;
  for (let i = 1; i < points.length; i++) d += ` H${x(points[i].asOf)} V${y(vals[i])}`;
  const area = `${d} V${H - padB} H${x(points[0].asOf)} Z`;
  const iMax = vals.indexOf(hi), iMin = vals.indexOf(lo);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-auto w-full text-accent ${className}`} role="img" aria-label="Balance over time">
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--line)" />
      <path d={area} fill="currentColor" opacity="0.1" className="fade-late" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" pathLength={1} className="draw" />
      <circle className="fade-late" cx={x(points[points.length - 1].asOf)} cy={y(vals[vals.length - 1])} r="3" fill="currentColor" />
      {hi !== lo ? (
        <>
          <text x={Math.min(W - padR - 60, x(points[iMax].asOf) + 6)} y={y(hi) - 6} fontSize="10" fill="var(--text-3)" fontFamily="var(--font-mono)">{formatCents(BigInt(Math.round(hi)))}</text>
          <text x={Math.min(W - padR - 60, x(points[iMin].asOf) + 6)} y={y(lo) + 12} fontSize="10" fill="var(--text-3)" fontFamily="var(--font-mono)">{formatCents(BigInt(Math.round(lo)))}</text>
        </>
      ) : null}
      <text x={padL} y={H - 6} fontSize="10" fill="var(--text-3)" fontFamily="var(--font-mono)">{DAY.format(new Date(points[0].asOf))}</text>
      <text x={W - padR} y={H - 6} fontSize="10" fill="var(--text-3)" fontFamily="var(--font-mono)" textAnchor="end">{DAY.format(new Date(points[points.length - 1].asOf))}</text>
    </svg>
  );
}
