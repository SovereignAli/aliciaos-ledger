import type { Metadata } from "next";
import { LoginScreen } from "../../_components/LoginScreen";

export const metadata: Metadata = { title: "Sign in" };

/** The only public route: the lock screen. */
export default function SignInPage() {
  return <LoginScreen />;
}
