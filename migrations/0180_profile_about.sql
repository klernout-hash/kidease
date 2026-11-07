-- Optional About you facts for the signed-in parent or daycare account.
-- Never a public listing field. Identity verification is not stored here.
alter table profiles add column if not exists about jsonb not null default '{}'::jsonb;
