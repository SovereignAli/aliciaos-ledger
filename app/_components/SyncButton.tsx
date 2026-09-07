"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { syncNow } from "@/app/connections/actions";

export function SyncButton({ institutionId }: { institutionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <button
        type="button"
        className="btn btn-quiet px-2.5 py-1 text-[12px]"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const r = await syncNow(institutionId);
          if (!r.ok) setMessage(r.message);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Syncing…" : "Sync"}
      </button>
      {message ? <p className="text-[11.5px] text-crit">{message}</p> : null}
    </div>
  );
}
