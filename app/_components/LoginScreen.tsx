"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { ThemeToggle } from "./ThemeToggle";
import { Wallpaper } from "./Wallpaper";
import { useMinuteClock } from "./useMinuteClock";

type Mode = "google" | "email" | "code";

const DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * The lock screen. Wallpaper, clock, one user, one field. Google is the
 * field's default action; an email code sits behind a small link, the way
 * macOS keeps its alternatives under the password box.
 */
export function LoginScreen({ busy }: { busy?: string }) {
  const router = useRouter();
  const { signIn } = useSignIn();
  const isLoaded = Boolean(signIn);
  const [mode, setMode] = useState<Mode>("google");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shake, setShake] = useState(0);
  const now = useMinuteClock();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "google") input.current?.focus();
  }, [mode]);

  const fail = (e: { message: string; longMessage?: string } | null | undefined) => {
    setError(e?.longMessage ?? e?.message ?? "Something went wrong.");
    setShake((n) => n + 1);
    setPending(false);
  };

  const google = async () => {
    if (!isLoaded || pending) return;
    setError(null);
    setPending(true);
    const { error: e } = await signIn.sso({ strategy: "oauth_google", redirectUrl: "/sign-in/sso-callback", redirectCallbackUrl: "/sign-in" });
    if (e) fail(e);
  };

  const sendCode = async () => {
    if (!isLoaded || pending || !email.trim()) return;
    setError(null);
    setPending(true);
    const { error: e } = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
    if (e) return fail(e);
    setPending(false);
    setMode("code");
  };

  const verify = async () => {
    if (!isLoaded || pending || code.trim().length < 6) return;
    setError(null);
    setPending(true);
    const { error: e } = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (e) return fail(e);
    const { error: f } = await signIn.finalize({ navigate: ({ session }) => { void session; router.push("/"); } });
    if (f) fail(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "google") void google();
    else if (mode === "email") void sendCode();
    else void verify();
  };

  return (
    <>
      <div className="wallpaper" aria-hidden="true"><Wallpaper /></div>
      <main className="login">
        <div className="login-clock" aria-hidden={!now}>
          <div className="login-date">{now ? DATE.format(now) : " "}</div>
          <div className="login-time num">{now ? TIME.format(now).replace(/\s?[AP]M$/, "") : " "}</div>
        </div>

        <div className="login-user">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-avatar" src="/mark.svg" alt="" width={92} height={92} />
          <div className="login-name">Alex Wilczewski</div>

          <form className={`login-field ${shake ? "login-shake" : ""}`} key={shake} onSubmit={submit}>
            {mode === "google" ? (
              <button type="submit" className="login-pill login-pill-btn" disabled={!isLoaded || pending || !!busy}>
                <GoogleMark />
                <span>{busy ?? (pending ? "Opening Google…" : "Continue with Google")}</span>
              </button>
            ) : mode === "email" ? (
              <label className="login-pill">
                <input ref={input} type="email" name="email" placeholder="Email address" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
              </label>
            ) : (
              <label className="login-pill">
                <input ref={input} type="text" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code from your email" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={pending} />
              </label>
            )}
            <button type="submit" className="login-go" aria-label="Continue" disabled={!isLoaded || pending || !!busy}>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </button>
          </form>

          <div className="login-under" role="status" aria-live="polite">
            {error ? <span className="login-error">{error}</span> : busy ? <span className="login-hint">One moment.</span> : null}
          </div>

          <div className="login-links login-chip">
            {mode === "google" ? (
              <button type="button" className="login-link" onClick={() => { setError(null); setMode("email"); }}>Use an email code instead</button>
            ) : mode === "email" ? (
              <button type="button" className="login-link" onClick={() => { setError(null); setMode("google"); }}>Back to Google</button>
            ) : (
              <>
                <button type="button" className="login-link" onClick={() => { setError(null); setCode(""); void sendCode(); }}>Send another code</button>
                <span className="login-dot">·</span>
                <button type="button" className="login-link" onClick={() => { setError(null); setCode(""); setMode("email"); }}>Different address</button>
              </>
            )}
          </div>
        </div>

        <div className="login-foot">
          <div className="login-chip login-chip-pills"><ThemeToggle /></div>
          <div className="login-host login-chip">ledger.example.com</div>
        </div>
      </main>
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="15" height="15" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
