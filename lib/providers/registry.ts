import { getPlaidClient } from "../plaid/client.ts";
import { PlaidProvider } from "./plaid.ts";
import type { AccountProvider, ProviderId } from "./types.ts";

/**
 * Sync-capable providers by id. Manual is deliberately absent: it is driven
 * by a batch of input, not by polling, so it is constructed at the call site.
 */
export function providerFor(id: ProviderId): AccountProvider {
  switch (id) {
    case "plaid":
      return new PlaidProvider(getPlaidClient());
    case "simplefin":
      throw new Error("SimpleFIN provider is not implemented");
    case "manual":
      throw new Error("The manual provider is batch-driven; construct it with its input");
  }
}
