-- 0005_account_apy: Plaid reports an APY for some depository accounts; keep it for the savings view.
alter table account add column apy numeric(6,3);
