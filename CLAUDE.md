# AliciaOS Ledger

A personal financial operations app for Alicia, who earns a W-2 salary. It links her banks
through Plaid, categorizes every transaction with an editable rules table, splits each paycheck
into a buffer, an investing share, and living money, and tracks spending against budgets.

It was forked from AlexOS Ledger (Alex's app, `alex-wilczewski/alexos-ledger`) on 2026-09-07
with a fresh git history. Alex is Alicia's brother and set this copy up so it can be built out
with Alicia on her own machine and her own accounts. Fixes that land in either app get ported
to the other by hand; there is no shared package.

## Stack

- Next.js (App Router) on Vercel, its own project, on Alicia's own Vercel account
- Postgres (Neon), accessed server-side only
- Clerk for auth on the **free plan** — Google sign-in primary, email code as fallback, access
  mode Restricted, and `OWNER_CLERK_USER_ID` pins the app to one user. Passkeys, TOTP and
  every other MFA strategy are Pro-plan features in Clerk. The security boundary is Alicia's
  Google account, so it needs its own 2FA before the app goes live.
- Plaid for bank data, read-only products only; manual entry stays as a fallback provider

## What is different from Alex's version, and why

**W-2 income, no contract work.** Her employer withholds tax, so there is no tax reserve bucket,
no self-employment tax, no set-aside rate, no `tax_year` table and no estimate engine. The
paycheck that lands is net pay and the split acts on that. Passive income (interest, dividends)
is still shown separately from payroll because it is not money to spend, but nothing tax-related
is computed from it. If she ever picks up 1099 work, bring the tax pieces back from Alex's repo
rather than reinventing them.

**No timesheet, no Google Sheet.** She does not bill hours. The sheet sync, punch clock, week
tabs, expense and payment blocks, and the `time_entry`, `pay_period`, `payment` and `tool_*`
tables were all removed. Do not add hours tracking unless she asks for it.

**Seed rules are placeholders.** Alex's migration seeded rules for his employer, credit union,
cards and family accounts. Here `0003_categories_roles.sql` seeds only the generic
Venmo/PayPal/Zelle rules. Alicia's rules (her employer's payroll string, her cards' payment
descriptions, any family transfers) get written as a new migration once her accounts are linked
and the raw descriptions are visible. Do not guess them.

## Decisions carried over from Alex's version

These were reasoned through there and still hold here. Do not relitigate them.

**One user.** Alicia only. No roles, no permission scoping, no second account. This removes an
entire class of authorization bug and keeps the Vercel Hobby plan (non-commercial personal use)
legitimate.

**Buckets are a floor, not a ledger.** The split is bookkeeping on one real savings balance. The
Cash tab shows the minimum to keep in savings (buffer plus investing not yet sent on), not a
set of sub-accounts. Investing releases when a categorized contribution leaves the bank.

**Manual entry is a provider, not a placeholder.** Everything that produces account data
implements one `AccountProvider` interface — `listAccounts`, `fetchBalances`,
`fetchTransactions`. Nothing below the adapter boundary knows which provider produced a row.

**Money is integer minor units.** `bigint` cents everywhere, in the database and in TypeScript.
Never a float, never a `numeric` for an amount.

**Negative means money leaving the account.** Always, everywhere internally. Plaid returns a
positive amount for an outflow; the adapter inverts it and a test asserts a known debit comes
out negative. Getting this wrong ships a bug where spending increases net worth.

**Deduplication is a hash, not a heuristic.** `dedupe_hash` = SHA-256 of
`account_id | posted_at | amount_cents | lower(trim(description))`. Unique index on
`(account_id, external_id)` where external_id is not null, and on `(account_id, dedupe_hash)`.
On conflict the row carrying an `external_id` wins.

**Internal transfers are paired and excluded at ingest.** Transactions in different linked
accounts with opposite amounts of equal magnitude within ~3 days get a `transfer_group_id` and
`is_internal`, and are excluded from income, spending and category charts while still counting
as bucket funding. `is_internal` is user-editable and a manual correction is authoritative.

**Plaid lessons that the docs do not teach.** Learned on Alex's accounts, still true here:

1. Use `/accounts/get`, not `/accounts/balance/get`, for routine display. The latter forces a
   live round trip and fell over at a credit union within an hour. Reserve it for when a
   real-time figure genuinely matters and fall back to the cached value with its timestamp.
2. Credential-based institutions break periodically. Handle `ITEM_LOGIN_REQUIRED` by marking
   the institution `needs_reauth`, showing it plainly, and serving the last known balance with
   its `as_of` date. Plaid update mode re-links without creating a new Item.
3. Plaid is positive-for-outflow. Invert in the adapter.
4. Merchant enrichment is thin at smaller institutions. The rules table is the truth; Plaid's
   category is a hint.

## Open decisions (to settle with Alicia before phase one)

- **Domain.** Not yet purchased. Until it exists, `proxy.ts` carries `ledger.example.com` as a
  placeholder in `authorizedParties`; the login screen's host chip and the README say the same.
- **Plaid account.** Alex's Plaid trial has spare Items, but linking Alicia's banks under his
  developer account puts her data behind his credentials. Prefer her own Plaid account; decide
  before linking anything.
- **Her banks and cards.** Unknown. Check each institution's Plaid coverage the way Alex did
  (a quick live probe) before promising sync.
- **Her split.** The seed policy is 10% buffer, 15% investing. It is a starting point to edit in
  the app, not a recommendation.
- **Styling.** Everything visual is still Alex's: the tokens at the top of `app/globals.css`, the
  Zalando Sans files in `public/fonts` loaded from `app/layout.tsx`, the shader presets in
  `app/_components/Wallpaper.tsx`, the boot banner on the overview page, and the icons in `app/`
  and `public/mark.svg`. Restyle for her once the functional pieces are hers; show it early.

## Build order

1. **Accounts and deploy.** Her Vercel account, Neon project, Clerk application (free plan,
   Google SSO, access Restricted), Plaid decision, domain. Deploy behind login with an empty
   database. *Gate: she signs in on her domain.*
2. **Bank sync.** Link her institutions, confirm sign convention on real rows, write her rules
   migration, verify transfer pairing between her own accounts.
   *Gate: her real paychecks show on the income page, categorized as payroll.*
3. **Tuning.** Her split, budgets, account roles, hidden accounts.
   *Gate: the overview number is one she trusts.*
4. **Restyle.** Her palette, type, wallpaper, marks.

## Security

- Never store bank credentials. The aggregator holds them; we hold a revocable access token.
- Provider access tokens: AES-256-GCM at rest, key in env. Decrypt only in server code.
- All provider calls server-side. No provider SDK in the client bundle.
- Read-only scopes only. Never request payment initiation or transfer.
- `audit_log` row for every mutation: actor, action, entity, before/after, timestamp.
- No analytics, session replay, or body-capturing error reporters on authenticated routes.
- `.env`, `tokens.json`, and anything holding a real balance stay out of git.

## Working agreements

- Ask before adding a dependency that isn't obviously required.
- Migrations are checked in and forward-only. The six that exist have never been applied to
  any database, so until the first deploy they may still be edited in place; after that, only
  new files.
- When an external API shape matters, verify it against the primary source (plaid.com/docs)
  rather than recalling it.
- Alicia is the user, Alex is the builder. Show visual work early rather than presenting it
  finished, and keep copy plain.
