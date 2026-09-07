/**
 * Money is integer minor units. `bigint` cents everywhere — in Postgres and in
 * TypeScript. Never a float, never a `numeric` for an amount.
 *
 * Sign convention: NEGATIVE means money leaving the account. Always.
 */
export type Cents = bigint;

const DOLLARS_RE = /^(-)?\$?\s*([0-9][0-9,]*)?(?:\.([0-9]{0,2}))?$/;

/**
 * Parse a human-entered dollar string ("1,250.50", "$30", "-12.05", ".5") into
 * cents without ever touching a float. Throws on anything ambiguous, including
 * more than two decimal places.
 */
export function parseDollarsToCents(input: string): Cents {
  const trimmed = input.trim();
  const m = DOLLARS_RE.exec(trimmed);
  if (!m || (m[2] === undefined && (m[3] === undefined || m[3] === ""))) {
    throw new RangeError(`Not a dollar amount: "${input}"`);
  }
  const negative = m[1] === "-";
  const whole = (m[2] ?? "0").replace(/,/g, "");
  const frac = (m[3] ?? "").padEnd(2, "0");
  const cents = BigInt(whole) * 100n + BigInt(frac);
  return negative ? -cents : cents;
}

/** Format cents as "$1,234.56" or "−$12.05". Never used for arithmetic. */
export function formatCents(cents: Cents, opts: { sign?: "auto" | "always" | "never" } = {}): string {
  const sign = opts.sign ?? "auto";
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `$${wholeStr}.${frac}`;
  if (negative && sign !== "never") return `−${body}`;
  if (!negative && sign === "always" && cents !== 0n) return `+${body}`;
  return body;
}

/** Postgres `bigint` columns arrive as strings from the driver. Convert exactly. */
export function centsFromDb(value: string | number | bigint): Cents {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError(`Unsafe integer from database: ${value}`);
    return BigInt(value);
  }
  if (!/^-?[0-9]+$/.test(value)) throw new RangeError(`Not an integer from database: "${value}"`);
  return BigInt(value);
}
