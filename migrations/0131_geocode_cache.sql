-- Cached OpenStreetMap pins for Need care fast street search.
-- The key is a hash of the address, not the address itself.
-- FEATURE_NCF_STREET stays off until Kyle turns it on.

create table if not exists geocode_cache (
  query_hash text primary key,
  lat double precision not null,
  lng double precision not null,
  label text not null,
  source text not null default 'nominatim',
  created_at timestamptz not null default now()
);
