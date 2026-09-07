import "server-only";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

/**
 * One user. Every server component, route handler and server action that
 * touches data calls this first — protection lives as close to the resource
 * as possible, with the proxy as an optimistic outer layer.
 *
 * OWNER_CLERK_USER_ID, once set, pins the app to Alex's Clerk user even if a
 * sign-up ever slips through. Unset, any signed-in Clerk user of this instance
 * is accepted — set it right after the first successful sign-in.
 */
/**
 * Local preview only: with DEV_BYPASS_AUTH=1 in a development build, pages
 * render for a stand-in user so the UI can be screenshotted without a
 * session. Ignored outright in production builds, and never set on Vercel.
 */
export const devBypass = () => process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "1";

export async function requireUserId(): Promise<string> {
  if (devBypass()) return "dev-preview";
  const { isAuthenticated, userId, redirectToSignIn } = await auth();
  if (!isAuthenticated || !userId) {
    redirectToSignIn();
    throw new Error("unreachable: redirectToSignIn() should have thrown");
  }
  const owner = process.env.OWNER_CLERK_USER_ID;
  if (owner && owner !== userId) notFound();
  return userId;
}
