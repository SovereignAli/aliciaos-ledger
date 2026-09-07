import "server-only";
import { headers } from "next/headers";

export async function requestIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** The per-request CSP nonce clerkMiddleware generated, for scripts we inject ourselves. */
export async function cspNonce(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-nonce") ?? undefined;
}
