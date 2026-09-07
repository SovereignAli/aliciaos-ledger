"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { completeLink, completeReauth, createLinkToken } from "@/app/connections/actions";

type Mode = { kind: "new" } | { kind: "update"; institutionId: string };

/**
 * One button that owns the whole Link lifecycle: ask the server for a token,
 * open Link when it's ready, hand the public token back, refresh the page.
 * The nonce is what lets Plaid's script through the strict CSP.
 */
export function PlaidLinkButton({ mode, nonce, className, children }: { mode: Mode; nonce?: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "token" | "link" | "finishing">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setBusy("finishing");
      setToken(null);
      const result =
        mode.kind === "update"
          ? await completeReauth(mode.institutionId)
          : publicToken
            ? await completeLink(publicToken, metadata.institution)
            : { ok: false as const, message: "Link returned no token." };
      if (!result.ok) setMessage("message" in result ? result.message : "Sync failed.");
      else setMessage(null);
      setBusy("idle");
      router.refresh();
    },
    [mode, router],
  );

  const { open, ready } = usePlaidLink({
    token,
    cspNonce: nonce,
    onSuccess,
    onExit: (err) => {
      setBusy("idle");
      setToken(null);
      if (err) setMessage(err.display_message ?? err.error_message ?? "Link closed with an error.");
    },
  });

  useEffect(() => {
    if (token && ready && busy === "link") open();
  }, [token, ready, busy, open]);

  async function start() {
    setMessage(null);
    setBusy("token");
    const res = await createLinkToken(mode.kind === "update" ? mode.institutionId : undefined);
    if (!res.ok) {
      setMessage(res.message);
      setBusy("idle");
      return;
    }
    setToken(res.linkToken);
    setBusy("link");
  }

  const label =
    busy === "token" ? "Preparing…" : busy === "link" ? "Opening Plaid…" : busy === "finishing" ? "Syncing…" : children;

  return (
    <div className="grid gap-1.5">
      <button type="button" className={className ?? "btn"} onClick={start} disabled={busy !== "idle"}>
        {label}
      </button>
      {message ? (
        <p role="status" className="text-[12.5px] leading-snug text-crit">
          {message}
        </p>
      ) : null}
    </div>
  );
}
