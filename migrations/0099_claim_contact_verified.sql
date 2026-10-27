-- Contact-on-file claim codes. Idempotent.
alter table listing_claims add column if not exists contact_verified int not null default 0;
alter table listing_claims add column if not exists contact_channel text;
alter table listing_claims add column if not exists code_sends int not null default 0;
alter table listing_claims add column if not exists code_attempts int not null default 0;
alter table listing_claims add column if not exists code_sent_at timestamptz;

-- Rollback:
-- alter table listing_claims drop column if exists code_sent_at;
-- alter table listing_claims drop column if exists code_attempts;
-- alter table listing_claims drop column if exists code_sends;
-- alter table listing_claims drop column if exists contact_channel;
-- alter table listing_claims drop column if exists contact_verified;
