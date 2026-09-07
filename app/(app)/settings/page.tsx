import { plaidConfigured } from "@/lib/plaid/client";
import { listLinkedInstitutions } from "@/lib/queries/connections";
import { cspNonce } from "@/lib/request";
import { UserButton } from "@clerk/nextjs";
import { ConnectionsPanel } from "../../_components/ConnectionsPanel";
import { AddAccountForm } from "../../_components/AddAccountForm";
import { listAccounts } from "@/lib/queries/income";
import { Window } from "../../_components/Window";

export default async function SettingsPage() {
  const [institutions, nonce, manualAccounts] = await Promise.all([listLinkedInstitutions(), cspNonce(), listAccounts()]);
  return (
    <>
      <div className="grid grid-cols-12 gap-[18px]">
        <div className="col-span-12 grid content-start gap-[18px] lg:col-span-4">
          <Window title="Account" right="One user." style={{ "--i": 0 } as React.CSSProperties} bodyClassName="px-[22px] pb-[18px] pt-1">
            <div className="flex items-center gap-4">
              <UserButton />
              <div className="text-[13px] leading-relaxed text-ink2">Signed in with Google. Sign out, or manage the account, from the avatar.</div>
            </div>
          </Window>
          <Window title="Manual accounts" right="For what no bank reports." style={{ "--i": 2 } as React.CSSProperties} bodyClassName="px-[22px] pb-[18px] pt-1">
            <AddAccountForm accounts={manualAccounts} />
          </Window>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <ConnectionsPanel institutions={institutions} nonce={nonce} plaidReady={plaidConfigured()} />
        </div>
      </div>
    </>
  );
}
