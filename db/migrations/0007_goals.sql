-- 0007_goals: a goal is a bucket with a purpose. "Trip in March", "New laptop".
-- It shares the bucket ledger, so it is held in savings like the buffer, funded
-- by hand or by a fixed slice of each paycheck, and released when the money is
-- spent. Free to spend already excludes every positive bucket balance, so a
-- goal parks money the moment it is funded.

alter table bucket
  add column kind               text not null default 'split' check (kind in ('split', 'goal')),
  add column target_cents       bigint check (target_cents is null or target_cents > 0),
  add column due_on             date,
  add column per_paycheck_cents bigint not null default 0 check (per_paycheck_cents >= 0),
  add column created_at         timestamptz not null default now(),
  add column closed_at          timestamptz;

-- The two split buckets are what they were.
update bucket set kind = 'split' where id in ('buffer', 'investing');
