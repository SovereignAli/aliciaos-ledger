import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Deny by default. Only the sign-in screen is reachable without a session;
 * everything else is sent to sign-in before it renders. This is the
 * optimistic outer layer — every data access re-checks via requireUserId().
 *
 * There is deliberately no sign-up route: one user, created in the Clerk
 * dashboard with sign-ups turned off.
 */
const PUBLIC = /^\/sign-in(\/.*)?$/;

export default clerkMiddleware(
  async (auth, req) => {
    // See lib/auth.ts: a development-only preview switch, never set in production.
    const bypass = process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "1";
    if (!PUBLIC.test(req.nextUrl.pathname) && !bypass) {
      await auth.protect();
    }
  },
  {
    // Session tokens are only honored when minted for one of these origins.
    // Clerk's production checklist asks for this explicitly.
    authorizedParties: ["https://ledger.alistation.net", "https://aliciaos-ledger.vercel.app", "http://localhost:3000"],
    // Nonce-based CSP with 'strict-dynamic'. No 'unsafe-inline' for scripts.
    contentSecurityPolicy: {
      strict: true,
      directives: {
        // Clerk's UI inlines small decorative SVGs as data: URIs.
        "img-src": ["data:"],
        // Plaid Link: script injected with our nonce, runs in an iframe from cdn.plaid.com.
        "script-src": ["https://cdn.plaid.com"],
        "frame-src": ["https://cdn.plaid.com"],
        "connect-src": ["https://cdn.plaid.com", "https://production.plaid.com", "https://sandbox.plaid.com"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"],
        "base-uri": ["'self'"],
      },
    },
  },
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
