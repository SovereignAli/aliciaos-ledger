-- 0004_paycheck_split: every payroll deposit is split into buckets that live inside
-- the savings account. Buckets are a ledger, not a transfer: the money stays put,
-- the app just knows whose it is. Free to spend = cash on hand minus what the
-- buckets hold. W-2 pay arrives with tax already withheld, so there is no tax
-- reserve bucket here; the split is buffer, investing, and whatever is left to live on.

create table split_policy (
  id             uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  buffer_pct     numeric(5,2) not null check (buffer_pct >= 0 and buffer_pct <= 100),
  invest_pct     numeric(5,2) not null check (invest_pct >= 0 and invest_pct <= 100),
  created_at     timestamptz not null default now(),
  check (buffer_pct + invest_pct <= 100)
);

-- Starting points, edited in the app once Alicia has settled on her own split.
insert into split_policy (effective_from, buffer_pct, invest_pct) values ('2024-01-01', 10, 15);

create table bucket (
  id    text primary key,          -- 'buffer' | 'investing'
  name  text not null,
  sort  int not null
);
insert into bucket (id, name, sort) values
  ('buffer',    'Buffer',    1),
  ('investing', 'Investing', 2);

create table paycheck (
  id            uuid primary key default gen_random_uuid(),
  txn_id        uuid not null unique references txn (id) on delete cascade,
  policy_id     uuid not null references split_policy (id),
  gross_cents   bigint not null,
  buffer_cents  bigint not null,
  invest_cents  bigint not null,
  living_cents  bigint not null,
  created_at    timestamptz not null default now(),
  check (buffer_cents + invest_cents + living_cents = gross_cents)
);

create table bucket_entry (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    text not null references bucket (id),
  amount_cents bigint not null,                         -- + funds the bucket, - releases from it
  occurred_on  date not null,
  source       text not null check (source in ('paycheck', 'release', 'manual')),
  txn_id       uuid references txn (id) on delete cascade,  -- the paycheck or the spend that moved it
  note         text,
  created_at   timestamptz not null default now()
);
-- One automatic entry per bucket per transaction, so re-running ingest is idempotent.
create unique index bucket_entry_auto_uidx on bucket_entry (bucket_id, txn_id) where txn_id is not null;
create index bucket_entry_bucket_idx on bucket_entry (bucket_id, occurred_on);
