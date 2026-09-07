"use client";

import { useEffect, useState } from "react";

/**
 * A clock that ticks exactly on the minute: the first update lands at the
 * next :00 second, then every 60s from there, so a displayed minute never
 * lags the real one by more than a frame.
 */
export function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = new Date();
    const paint = setTimeout(() => setNow(first), 0); // after mount, not during the effect
    const untilNextMinute = 60_000 - (first.getSeconds() * 1000 + first.getMilliseconds());
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, untilNextMinute);
    const onWake = () => { if (document.visibilityState === "visible") setNow(new Date()); };
    document.addEventListener("visibilitychange", onWake);
    return () => { clearTimeout(paint); clearTimeout(timeout); if (interval) clearInterval(interval); document.removeEventListener("visibilitychange", onWake); };
  }, []);
  return now;
}
