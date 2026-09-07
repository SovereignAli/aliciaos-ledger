import type { Cents } from "../money.ts";

/**
 * Split a paycheck by percentages in integer cents. Each slice is floored;
 * living gets whatever is left, so the three always sum to the gross and no
 * cent is invented by rounding.
 */
export interface SplitPolicy {
  bufferPct: number;
  investPct: number;
}

export interface Split {
  gross: Cents;
  buffer: Cents;
  invest: Cents;
  living: Cents;
}

function slice(gross: Cents, pct: number): Cents {
  // pct has at most two decimals; scale to basis points to stay in integers.
  const bp = BigInt(Math.round(pct * 100));
  return (gross * bp) / 10_000n;
}

export function splitPaycheck(gross: Cents, policy: SplitPolicy): Split {
  if (gross <= 0n) throw new RangeError("A paycheck must be a positive amount");
  const buffer = slice(gross, policy.bufferPct);
  const invest = slice(gross, policy.investPct);
  const living = gross - buffer - invest;
  if (living < 0n) throw new RangeError("Split percentages exceed 100%");
  return { gross, buffer, invest, living };
}
