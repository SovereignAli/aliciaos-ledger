import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { LoginScreen } from "../../_components/LoginScreen";

/** Google sends the browser back here; Clerk finishes the session and moves on. */
export default function SsoCallbackPage() {
  return (
    <>
      <LoginScreen busy="Signing in…" />
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
    </>
  );
}
