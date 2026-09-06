-- Saved parent searches + alert prefs + geofence match log.
-- Origin lat/lng are the values the parent already used in search — never invented.
-- Matching jobs use the same PostGIS ST_DWithin pattern as nearby.ts
-- (st_makepoint(lng, lat) on daycares.location). This file does not add geography.
-- FEATURE_PUSH stays off; this schema is email + in-app only. No FCM tokens here.

create table if not exists saved_searches (
  id text primary key,
  user_id text not null,
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  center_label text not null,
  radius_km int not null,
  age_band text not null default 'any',
  filters jsonb not null default '{}',
  alerts_enabled int not null default 1,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'saved_searches_age_band_chk'
  ) then
    alter table saved_searches
      add constraint saved_searches_age_band_chk
      check (age_band in ('any', 'infant', 'toddler', 'preschool'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'saved_searches_radius_chk'
  ) then
    alter table saved_searches
      add constraint saved_searches_radius_chk
      check (radius_km >= 1 and radius_km <= 50);
  end if;
end $$;

create index if not exists saved_searches_user_idx
  on saved_searches (user_id, updated_at desc);

create index if not exists saved_searches_alerts_idx
  on saved_searches (alerts_enabled, last_checked_at)
  where alerts_enabled = 1;

-- Per-user channel prefs. Email uses Resend when wired; otherwise the send path stubs.
-- in_app = family-desk notices. Push / FCM is out of scope (FEATURE_PUSH defaults off).
create table if not exists search_alert_prefs (
  user_id text primary key,
  email_enabled int not null default 1,
  in_app_enabled int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists search_alert_notices (
  id text primary key,
  user_id text not null,
  saved_search_id text references saved_searches(id) on delete cascade,
  daycare_id text,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'search_alert_notices_kind_chk'
  ) then
    alter table search_alert_notices
      add constraint search_alert_notices_kind_chk
      check (kind in ('new_centre', 'vacancy_reconfirmed'));
  end if;
end $$;

create index if not exists search_alert_notices_user_idx
  on search_alert_notices (user_id, created_at desc);

-- Job log / dedup. First pass baselines without notifying.
create table if not exists search_alert_candidates (
  id text primary key,
  saved_search_id text not null references saved_searches(id) on delete cascade,
  daycare_id text not null,
  kind text not null,
  distance_km double precision,
  vacancy_updated_at timestamptz,
  notified int not null default 0,
  seen_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'search_alert_candidates_kind_chk'
  ) then
    alter table search_alert_candidates
      add constraint search_alert_candidates_kind_chk
      check (kind in ('new_centre', 'vacancy_reconfirmed'));
  end if;
end $$;

create unique index if not exists search_alert_candidates_uidx
  on search_alert_candidates (saved_search_id, daycare_id, kind);

create index if not exists search_alert_candidates_search_idx
  on search_alert_candidates (saved_search_id, seen_at desc);
