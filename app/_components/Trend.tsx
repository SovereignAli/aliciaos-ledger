import { formatCents, type Cents } from "@/lib/money";
import { TrendDownIcon, TrendUpIcon } from "./Icons";

/** An arrow and a delta, colored only when it matters. `invert` for figures where up is bad (a card balance). */
export function Trend({ delta, label = "30d", invert = false, className = "" }: { delta: Cents | null; label?: string; invert?: boolean; className?: string }) {
  if (delta === null) return <span className={`text-[11.5px] text-ink3 ${className}`}>No history yet.</span>;
  if (delta === 0n) return <span className={`mono text-[11.5px] text-ink3 ${className}`}>Flat · {label}.</span>;
  const up = delta > 0n;
  const good = invert ? !up : up;
  const tone = good ? "text-positive" : "text-negative";
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] ${tone} ${className}`}>
      {up ? <TrendUpIcon className="h-3.5 w-3.5" /> : <TrendDownIcon className="h-3.5 w-3.5" />}
      <span className="mono num">{formatCents(delta, { sign: "never" })} · {label}.</span>
    </span>
  );
}

/** Beside a month: a rising arrow when income beat spending, a falling one otherwise. */
export function NetDot({ net }: { net: Cents }) {
  return net >= 0n ? (
    <TrendUpIcon className="h-3.5 w-3.5 text-positive" />
  ) : (
    <TrendDownIcon className="h-3.5 w-3.5 text-negative" />
  );
}
