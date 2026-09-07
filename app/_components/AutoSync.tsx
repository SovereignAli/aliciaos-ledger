"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { syncStale } from "@/app/connections/actions";

/**
 * Pull on app load, the way the spec asks, without blocking first paint:
 * the page renders what it has, this kicks the sync, then refreshes.
 */
export function AutoSync({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;
    syncStale().then((r) => {
      if (r.synced > 0) router.refresh();
    });
  }, [enabled, router]);
  return null;
}
