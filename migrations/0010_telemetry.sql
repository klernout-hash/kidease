-- Coarse location telemetry only (geohash ~5 km). No raw lat/lng. 7-day retain.
create table if not exists location_telemetry (
  id text primary key,
  kind text not null,
  geohash text not null,
  city text,
  province text,
  radius_km integer,
  slug text,
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists location_telemetry_created_idx on location_telemetry (created_at desc);
create index if not exists location_telemetry_hash_idx on location_telemetry (geohash);
