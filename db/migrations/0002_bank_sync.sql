-- 0002_bank_sync: what the Plaid adapter needs that the manual provider did not.

-- /transactions/sync is cursor-based; the cursor belongs to the Item.
alter table institution
  add column sync_cursor text,
  add column last_error  text;

-- Plaid gives a mask and an official name; useful for telling two savings accounts apart.
alter table account
  add column mask          text,
  add column official_name text;

-- Plaid's account taxonomy includes 'other'; allow it rather than mislabel.
alter table account drop constraint account_type_check;
alter table account add constraint account_type_check
  check (type in ('depository', 'investment', 'credit', 'loan', 'other'));
