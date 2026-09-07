import type { Cents } from "@/lib/money";

/** A small stepped area, for balances that only change on events. */
export function Sparkline({ points, width = 160, height = 36, className = "" }: { points: Array<{ on: string; balance: Cents }>; width?: number; height?: number; className?: string }) {
  if (points.length === 0) return <svg width={width} height={height} className={className} aria-hidden="true" />;
  const vals = points.map((p) => Number(p.balance));
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const n = vals.length;
  const x = (i: number) => (n === 1 ? width : (i / (n - 1)) * (width - 2) + 1);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  // Step: hold each value until the next event.
  let d = `M1,${y(vals[0])}`;
  for (let i = 1; i < n; i++) d += ` H${x(i)} V${y(vals[i])}`;
  d += ` H${width - 1}`;
  const area = `${d} V${height - 1} H1 Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={area} fill="currentColor" opacity="0.12" className="fade-late" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" pathLength={1} className="draw" />
      <circle className="fade-late" cx={width - 1} cy={y(vals[n - 1])} r="2.2" fill="currentColor" />
    </svg>
  );
}
