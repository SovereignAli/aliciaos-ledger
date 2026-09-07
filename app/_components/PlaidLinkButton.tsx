"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { completeLink, completeReauth, createLinkToken } from "@/app/connections/actions";

type Mode = { kind: "new" } | { kind: "update"; institutionId: string };

/** Where the in-flight link token waits while an OAuth bank sends the browser away and back. */
const TOKEN_KEY = "aliciaos-plaid-link";

/**
 * One button that owns the whole Link lifecycle: ask the server for a token,
 * open Link when it's ready, hand the public token back, refresh the page.
 * The nonce is what lets Plaid's script through the strict CSP.
 *
 * OAuth institutions leave the page for the bank's site and return to the
 * redirect URI with `oauth_state_id` in the query. The token is kept in
 * sessionStorage across that round trip, and on return Link is reopened with
 * the full URL so it can pick the flow back up.
 */
export function PlaidLinkButton({ mode, nonce, className, children }: { mode: Mode; nonce?: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<"idle" | "token" | "link" | "finishing">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const finish = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
    setToken(null);
    setReceivedRedirectUri(undefined);
    if (window.location.search.includes("oauth_state_id")) router.replace(window.location.pathname);
  }, [router]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setBusy("finishing");
      finish();
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
    [mode, router, finish],
  );

  const { open, ready } = usePlaidLink({
    token,
    receivedRedirectUri,
    cspNonce: nonce,
    onSuccess,
    onExit: (err) => {
      setBusy("idle");
      finish();
      if (err) setMessage(err.display_message ?? err.error_message ?? "Link closed with an error.");
    },
  });

  // Back from an OAuth bank: resume with the token that was put aside before leaving.
  useEffect(() => {
    if (!window.location.search.includes("oauth_state_id")) return;
    let stored: { token: string; mode: Mode } | null = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
    } catch {}
    if (!stored || JSON.stringify(stored.mode) !== JSON.stringify(mode)) return;
    // Reading the URL and sessionStorage is only possible after hydration, so this
    // is a genuine external-state sync rather than derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceivedRedirectUri(window.location.href);
    setToken(stored.token);
    setBusy("link");
  }, [mode]);

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
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: res.linkToken, mode }));
    } catch {}
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
