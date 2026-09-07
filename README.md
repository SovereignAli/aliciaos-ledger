# AliciaOS Ledger

Personal financial operations for one person on a W-2 salary: linked banks, categorized
transactions, a paycheck split into buffer / investing / living, and budgets. Read
[CLAUDE.md](CLAUDE.md) first — it holds the decisions that are already settled, what was
deliberately left out of this fork, and the open questions to settle with Alicia.

Forked from [alexos-ledger](https://github.com/alex-wilczewski/alexos-ledger) on 2026-09-07
with a fresh history. The domain, Vercel project, Clerk application, Neon database and Plaid
account are all still to be created; see *Open decisions* in CLAUDE.md.

## What is here

- Next.js 16 (App Router) with Clerk auth on the free plan — Google sign-in primary, email code fallback, no Clerk MFA (Pro-only)
- Neon Postgres, forward-only SQL migrations in `db/migrations` (six files, none applied anywhere yet)
- `AccountProvider` interface with the manual provider and the Plaid provider implementing it, and a shared
  ingest path that normalizes to integer cents, dedupes by hash, categorizes by rules, and pairs internal transfers
- Pages: overview, cash (buckets), savings, investments, transactions, budgets, income, settings, connections

## Layout

```
proxy.ts                 Clerk middleware; deny by default, /sign-in is the only public route
app/(app)/               Authenticated pages; layout.tsx is the desktop shell
app/(app)/actions.ts     Server Actions for categories, roles, budgets, the split, bucket moves
app/actions.ts           Server Actions for manual income and manual accounts
app/connections/         Plaid Link and sync actions
lib/auth.ts              requireUserId() — every data access calls this first
lib/db.ts                Sql interface + Neon HTTP client
lib/money.ts             bigint cents, exact dollar parsing, formatting
lib/providers/           AccountProvider, manual and Plaid implementations
lib/ingest/              upsert accounts/balances/txns, dedupe hash, transfer pairing, audit rows
lib/categories/          rule matching at ingest
lib/buckets/             the paycheck split and bucket entries
lib/queries/             read models per page
lib/crypto.ts            AES-256-GCM for provider tokens
db/migrate.ts            node --env-file=.env.local db/migrate.ts
db/import-csv.ts         import history through the manual provider
db/sync.ts               sync every linked institution from the CLI
```

## Local setup

1. **Neon.** Create a project, copy the pooled connection string into `DATABASE_URL`.
2. **Clerk.** Create an application. In the dashboard:
   - *User & Authentication → Email*: on. *Password*: both switches off.
   - *SSO connections*: Google on.
   - *Multi-factor*: leave off; every strategy is Pro-only. The Google account's own 2FA is the
     second factor, so turn that on first.
   - *Access mode*: **Restricted**. Create the one user by hand under *Users*.
   - *Domains*: add the production domain once it exists; `localhost` works for development.
   - Copy the publishable and secret keys.
3. **Plaid.** Decide whose Plaid account this runs under (CLAUDE.md, *Open decisions*), then
   copy the client id and secret. `PLAID_ENV` is `sandbox` until real banks are linked.
4. Copy `env.example` to `.env.local` and fill it in. Generate `TOKEN_ENCRYPTION_KEY` with
   the command in the comment.
5. `npm install`, then:

```bash
npm run db:migrate
```

```bash
npm run dev
```

6. Sign in at `http://localhost:3000/sign-in` with Google, then put the Clerk user id into
   `OWNER_CLERK_USER_ID` so no other user of the instance can ever get in.

### Bringing in history by hand

Create a manual account under *Settings*, then:

```bash
npm run db:import -- export.csv --account <account-slug>
```

The CSV needs a header row with `date` (YYYY-MM-DD), `amount` (unsigned dollars) and
`description`; `direction` (`in`/`out`, default `in`) and `account` are optional per-row
overrides. Re-running the import is harmless — duplicates collapse on the dedupe hash.

## Checks

```bash
npm test
```

```bash
npm run typecheck && npm run lint && npm run build
```

Tests are plain `node:test` on `.ts` files (Node 22.18+).

## Deploying

Vercel, its own project on Alicia's account, Hobby plan. Set the same variables as
`.env.local` in the project environment, run the migration against the production database
from a laptop (`DATABASE_URL=... node db/migrate.ts`), and point her domain at it. The domain is
`ledger.alistation.net` (Namecheap); it is listed in `proxy.ts` (`authorizedParties`) and shown on the
login screen's host chip. Before the first production sign-in on it, create Clerk's production
instance for that domain and switch the Google OAuth app to production credentials.

## Security posture

- Every route behind Clerk; `proxy.ts` denies by default and `requireUserId()` re-checks at the data
- Nonce-based CSP with `strict-dynamic` from `clerkMiddleware`; HSTS preload, `X-Frame-Options: DENY`
- No analytics, no session replay, no error reporter. Clerk telemetry disabled by env.
- `audit_log` row for every mutation with actor, before/after and IP
- Provider tokens are AES-256-GCM at rest, decrypted only in server code
- `.env*` files never leave the machine; only `env.example` is tracked
