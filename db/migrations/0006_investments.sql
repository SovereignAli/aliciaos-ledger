-- 0006_investments: what a brokerage holds and does. Quantities are share counts,
-- not money, so numeric is right there; prices and values are cents.

create table security (
  id                 uuid primary key default gen_random_uuid(),
  external_id        text not null unique,          -- Plaid security_id
  ticker             text,
  name               text not null,
  type               text,                          -- 'etf', 'mutual fund', 'equity', 'cash', ...
  close_price_cents  bigint,
  close_price_as_of  date,
  currency           text not null default 'USD'
);

create table holding (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null references account (id),
  security_id              uuid not null references security (id),
  quantity                 numeric(20,8) not null,
  institution_price_cents  bigint,
  institution_value_cents  bigint not null,
  cost_basis_cents         bigint,
  as_of                    date not null,
  updated_at               timestamptz not null default now(),
  unique (account_id, security_id)
);

create table investment_txn (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references account (id),
  external_id   text not null unique,               -- Plaid investment_transaction_id
  security_id   uuid references security (id),
  posted_at     date not null,
  name          text not null,
  type          text not null,                      -- buy | sell | cash | fee | transfer | ...
  subtype       text,
  quantity      numeric(20,8) not null default 0,
  amount_cents  bigint not null,                    -- negative = money leaving the account, as everywhere
  price_cents   bigint,
  fees_cents    bigint,
  created_at    timestamptz not null default now()
);
create index investment_txn_account_idx on investment_txn (account_id, posted_at desc);
