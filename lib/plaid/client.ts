import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

/**
 * One Plaid client per process. Server-side only — this module must never be
 * imported from a client component.
 */
let cached: PlaidApi | undefined;

export function plaidEnvName(): "sandbox" | "production" {
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (env !== "sandbox" && env !== "production") throw new Error(`PLAID_ENV must be sandbox or production, got "${env}"`);
  return env;
}

export function getPlaidClient(): PlaidApi {
  if (cached) return cached;
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("PLAID_CLIENT_ID and PLAID_SECRET are not set");
  cached = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[plaidEnvName()],
      baseOptions: {
        headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret, "Plaid-Version": "2020-09-14" },
      },
    }),
  );
  return cached;
}

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}
