import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory otherwise confuses root detection.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  // Content-Security-Policy is set per request by clerkMiddleware in proxy.ts
  // so the nonce is fresh every time.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
