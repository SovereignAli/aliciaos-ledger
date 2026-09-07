-- 0001_init: phase one schema. Forward-only; never edit after it has been applied.
-- Source: CLAUDE.md "Decisions that are already settled".

-- ---------------------------------------------------------------------------
-- Banking domain
-- ---------------------------------------------------------------------------

create table institution (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                       -- e.g. 'Chase', 'Fidelity'
  provider       text not null
                   check (provider in ('manual', 'simplefin', 'plaid')),
  external_id    text,                                -- provider's item id; null for manual
  access_token   bytea,                               -- AES-256-GCM ciphertext, never leaves the server
  status         text not null default 'ok'
                   check (status in ('ok', 'needs_reauth', 'error')),
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (provider, external_id)
);

create table account (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution (id),
  external_id    text not null,                       -- provider id, or a stable synthetic one for manual
  name           text not null,
  type           text not null
                   check (type in ('depository', 'investment', 'credit', 'loan')),
  subtype        text not null
                   check (subtype in ('checking', 'savings', 'brokerage', 'ira', 'roth', 'hysa', 'other')),
  currency       text not null default 'USD',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (institution_id, external_id)
);

create table balance_snapshot (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references account (id),
  as_of           date not null,
  current_cents   bigint not null,
  available_cents bigint,
  source          text not null check (source in ('manual', 'sync')),
  created_at      timestamptz not null default now(),
  unique (account_id, as_of, source)
);

create table txn (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references account (id),
  external_id       text,                             -- null for manual; dedupe falls back to the hash
  posted_at         date not null,
  amount_cents      bigint not null,                  -- NEGATIVE = money leaving the account. Always.
  description       text not null,
  category          text,
  pending           boolean not null default false,
  source            text not null check (source in ('manual', 'simplefin', 'plaid')),
  dedupe_hash       bytea not null,                   -- sha256(account_id|posted_at|amount_cents|lower(trim(description)))
  transfer_group_id uuid,                             -- set on both legs of an internal transfer
  is_internal       boolean not null default false,   -- excluded from income/spending totals
  is_internal_manual boolean not null default false,  -- true once the pairing was overridden by hand; ingest never touches it again
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index txn_account_external_uidx on txn (account_id, external_id) where external_id is not null;
create unique index txn_account_dedupe_uidx   on txn (account_id, dedupe_hash);
create index txn_account_posted_idx on txn (account_id, posted_at desc);
create index txn_transfer_group_idx on txn (transfer_group_id) where transfer_group_id is not null;

-- ---------------------------------------------------------------------------
-- Audit: one row per mutation. actor is the Clerk user id, or 'system' for
-- scripts run from the CLI.
-- ---------------------------------------------------------------------------

create table audit_log (
  id          bigint generated always as identity primary key,
  actor       text not null,
  action      text not null,                          -- 'txn.insert', 'txn.update', 'account.insert', ...
  entity      text not null,                          -- table name
  entity_id   text not null,
  before      jsonb,
  after       jsonb,
  ip          inet,
  occurred_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id);
