"use client";

import { useTransition } from "react";
import { setAccountHidden, setAccountRole } from "@/app/(app)/actions";
import { Menu } from "./ui/Menu";

const ROLES: Array<[string, string]> = [
  ["cash", "Cash"],
  ["long_term_savings", "Long-term savings"],
  ["investment", "Investments"],
  ["credit", "Credit"],
  ["other", "Other"],
];

/** Per-account actions behind a three-dot menu: which tab it lives under, and hiding it. */
export function AccountMenu({ accountId, role, name }: { accountId: string; role: string; name: string }) {
  const [, start] = useTransition();
  return (
    <Menu
      label={`Options for ${name}`}
      items={[
        ...ROLES.map(([v, l]) => ({
          label: l,
          checked: role === v,
          hint: role === v ? "shown here" : undefined,
          onSelect: () => start(async () => { if (role !== v) await setAccountRole(accountId, v); }),
        })),
        { label: "Hide account", danger: true, onSelect: () => start(async () => { await setAccountHidden(accountId, true); }) },
      ]}
    />
  );
}
