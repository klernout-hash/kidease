-- Catalogue upsert skips any daycare a provider owns. The primary key is
-- (user_id, daycare_id), which does not serve daycare_id lookups.
create index if not exists provider_daycares_daycare_idx
  on provider_daycares (daycare_id);
