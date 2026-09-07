-- Photo freshness for soft demotion. Stamp only when a provider uploads a real
-- storefront or interior. Never backfill from claimed_at, catalog photos, or vacancy.
-- Incomplete or stale listings stay searchable. Paid plans never enter this signal.

alter table daycares
  add column if not exists last_photo_updated_at timestamptz;

comment on column daycares.last_photo_updated_at is
  'Set only when a provider uploads a real storefront or interior. Never invented or backfilled from claimed_at.';
