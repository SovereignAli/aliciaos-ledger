-- 0003_categories_roles: how money is organized.
--   * account.role groups accounts the way the owner thinks about them (cash / long-term savings /
--     investments / credit), independent of Plaid's type.
--   * category is our taxonomy; Plaid's personal_finance_category is only a hint mapped onto it.
--   * category_rule is the editable pattern table applied at ingest.
--   * txn.category_id is the assigned category; txn.category keeps the raw provider hint.

alter table account add column role text not null default 'cash'
  check (role in ('cash', 'long_term_savings', 'investment', 'credit', 'other'));

create table category (
  id                   text primary key,             -- 'payroll', 'food_and_drink', ...
  name                 text not null,
  "group"              text not null
                         check ("group" in ('income', 'passive_income', 'transfer', 'debt', 'investing', 'spending')),
  is_spendable_income  boolean not null default false, -- counts toward money to split and spend
  sort                 int not null default 100
);

create table category_rule (
  id           uuid primary key default gen_random_uuid(),
  pattern      text not null,                          -- ILIKE pattern against description
  direction    text check (direction in ('in', 'out')), -- null = either
  account_id   uuid references account (id),            -- null = any account
  category_id  text not null references category (id),
  priority     int not null default 100,                -- lower wins
  note         text,
  created_at   timestamptz not null default now()
);

-- Plaid detailed category → ours. The hint of last resort.
create table plaid_category_map (
  plaid_detailed text primary key,
  category_id    text not null references category (id)
);

alter table txn
  add column category_id     text references category (id),
  add column category_source text check (category_source in ('rule', 'provider', 'manual'));
create index txn_category_idx on txn (category_id, posted_at desc);

-- ---------------------------------------------------------------------------
-- Taxonomy. Groups drive every report; ids are stable and referenced by code.
-- ---------------------------------------------------------------------------
insert into category (id, name, "group", is_spendable_income, sort) values
  ('payroll',                 'Payroll',                 'income',         true,  10),
  ('gig_income',              'Other work income',       'income',         true,  11),
  ('tax_refund',              'Tax refund',              'income',         true,  12),
  ('interest',                'Interest',                'passive_income', false, 20),
  ('dividends',               'Dividends',               'passive_income', false, 21),
  ('internal_transfer',       'Internal transfer',       'transfer',       false, 30),
  ('family_transfer',         'Family transfer',         'transfer',       false, 31),
  ('app_transfer',            'Venmo / PayPal / Zelle',  'transfer',       false, 32),
  ('other_transfer',          'Other transfer',          'transfer',       false, 33),
  ('credit_card_payment',     'Credit card payment',     'debt',           false, 40),
  ('loan_payment',            'Loan payment',            'debt',           false, 41),
  ('investment_contribution', 'Investment contribution', 'investing',      false, 50),
  ('retirement_contribution', 'Retirement contribution', 'investing',      false, 51),
  ('savings_contribution',    'Long-term savings',       'investing',      false, 52),
  ('food_and_drink',          'Food & drink',            'spending',       false, 60),
  ('groceries',               'Groceries',               'spending',       false, 61),
  ('shopping',                'Shopping',                'spending',       false, 62),
  ('entertainment',           'Entertainment',           'spending',       false, 63),
  ('transportation',          'Transportation',          'spending',       false, 64),
  ('travel',                  'Travel',                  'spending',       false, 65),
  ('rent_and_utilities',      'Rent & utilities',        'spending',       false, 66),
  ('home',                    'Home',                    'spending',       false, 67),
  ('medical',                 'Medical',                 'spending',       false, 68),
  ('personal_care',           'Personal care',           'spending',       false, 69),
  ('services',                'Services',                'spending',       false, 70),
  ('government',              'Government & non-profit', 'spending',       false, 71),
  ('bank_fees',               'Bank fees',               'spending',       false, 72),
  ('gear',                    'Gear & software',         'spending',       false, 73),
  ('other_spending',          'Other',                   'spending',       false, 99);

-- Plaid PFCv2 detailed values → our ids. Anything unmapped falls back by primary in code.
insert into plaid_category_map (plaid_detailed, category_id) values
  ('INCOME_SALARY', 'payroll'), ('INCOME_CONTRACTOR', 'gig_income'), ('INCOME_GIG_ECONOMY', 'gig_income'),
  ('INCOME_TAX_REFUND', 'tax_refund'), ('INCOME_INTEREST_EARNED', 'interest'), ('INCOME_DIVIDENDS', 'dividends'),
  ('INCOME_OTHER', 'gig_income'),
  ('TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'app_transfer'), ('TRANSFER_OUT_TRANSFER_OUT_TO_APPS', 'app_transfer'),
  ('TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS', 'investment_contribution'),
  ('TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'investment_contribution'),
  ('TRANSFER_IN_SAVINGS', 'other_transfer'), ('TRANSFER_OUT_SAVINGS', 'other_transfer'),
  ('TRANSFER_IN_ACCOUNT_TRANSFER', 'other_transfer'), ('TRANSFER_OUT_ACCOUNT_TRANSFER', 'other_transfer'),
  ('TRANSFER_IN_DEPOSIT', 'other_transfer'), ('TRANSFER_OUT_WITHDRAWAL', 'other_transfer'),
  ('TRANSFER_IN_WIRE', 'other_transfer'), ('TRANSFER_OUT_WIRE', 'other_transfer'),
  ('TRANSFER_IN_OTHER_TRANSFER_IN', 'other_transfer'), ('TRANSFER_OUT_OTHER_TRANSFER_OUT', 'other_transfer'),
  ('LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'credit_card_payment'),
  ('FOOD_AND_DRINK_GROCERIES', 'groceries'),
  ('GENERAL_SERVICES_ELECTRONICS_AND_SOFTWARE', 'gear'),
  ('GENERAL_MERCHANDISE_ELECTRONICS', 'gear');

-- ---------------------------------------------------------------------------
-- Starter rules. Lower priority number wins; first match stops. The rules that
-- name Alicia's employer, bank and cards get added once her accounts are linked
-- and the raw descriptions are known (see CLAUDE.md).
-- ---------------------------------------------------------------------------
insert into category_rule (pattern, direction, category_id, priority, note) values
  ('Venmo',    null, 'app_transfer', 50, NULL),
  ('%PAYPAL%', null, 'app_transfer', 50, NULL),
  ('%ZELLE%',  null, 'app_transfer', 50, NULL);

-- ---------------------------------------------------------------------------
-- Budget targets: a monthly amount per spending category, effective from a
-- month until superseded by a later row. History stays reproducible.
-- ---------------------------------------------------------------------------
create table budget_target (
  category_id    text not null references category (id),
  effective_from date not null,                        -- first of a month
  target_cents   bigint not null check (target_cents >= 0),
  created_at     timestamptz not null default now(),
  primary key (category_id, effective_from),
  check (effective_from = date_trunc('month', effective_from)::date)
);
