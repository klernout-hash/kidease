-- Mark store-review accounts so public search and admin tools can tell them apart.
alter table profiles add column if not exists is_test int not null default 0;
