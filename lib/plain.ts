/**
 * Client components can't receive bigint props (React can't serialize them),
 * so money crosses that boundary as a number of cents. Everything server-side
 * stays bigint; this is only for the last hop into a "use client" tree.
 */
export type Plain<T> = T extends bigint ? number : T extends Array<infer U> ? Plain<U>[] : T extends object ? { [K in keyof T]: Plain<T[K]> } : T;

export function plain<T>(v: T): Plain<T> {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x))) as Plain<T>;
}
