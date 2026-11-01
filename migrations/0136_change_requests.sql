-- Listing changes stay off the public row until the province approves.
-- Address text does not move lat/lng.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table daycares add column if not exists director_name text;

create table if not exists listing_change_requests (
  id text primary key,
  daycare_id text not null,
  province text not null,
  field text not null,
  proposed_value text not null,
  status text not null default 'pending',
  requested_by text not null,
  reviewed_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (field in ('capacity', 'hours', 'address', 'director')),
  check (status in ('pending', 'approved', 'declined'))
);

create index if not exists listing_change_requests_province_idx
  on listing_change_requests (province, status, created_at);
