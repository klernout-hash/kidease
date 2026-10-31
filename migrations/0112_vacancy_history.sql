-- Append-only vacancy confirms. A failed insert must not hide the listing.
-- FEATURE_PROVINCIAL_VACANCY_INDEX stays off until Kyle turns it on.

create table if not exists vacancy_events (
  id text primary key,
  daycare_id text not null,
  province text not null default '',
  recorded_at timestamptz not null default now(),
  source text not null,
  spots_infant integer,
  spots_toddler integer,
  spots_preschool integer,
  previous_updated_at timestamptz
);

create index if not exists vacancy_events_province_idx
  on vacancy_events (province, recorded_at desc);
