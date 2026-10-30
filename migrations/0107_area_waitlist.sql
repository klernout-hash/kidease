-- Area waitlist. A parent saves a place, radius, age group, and optional start date.
-- Rows live on saved_searches (kind = waitlist_area) so the hourly search-alerts
-- job can match them. Email stays behind FEATURE_AREA_WAITLIST_ALERTS (default off).
-- FEATURE_PUSH and FEATURE_SMS stay off. No Google geocoder.

alter table saved_searches add column if not exists kind text not null default 'search';
alter table saved_searches add column if not exists start_date date;
alter table saved_searches add column if not exists postal_code text;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'saved_searches_kind_chk'
  ) then
    alter table saved_searches drop constraint saved_searches_kind_chk;
  end if;
  alter table saved_searches
    add constraint saved_searches_kind_chk
    check (kind in ('search', 'waitlist_area'));
end $$;

create index if not exists saved_searches_area_idx
  on saved_searches (kind, alerts_enabled, last_checked_at)
  where kind = 'waitlist_area';

-- One row per parent, centre, and spot key (vacancy day + spot counts).
create table if not exists area_waitlist_sends (
  id text primary key,
  user_id text not null,
  saved_search_id text references saved_searches(id) on delete set null,
  daycare_id text not null,
  spot_key text not null,
  age_group text not null,
  in_app int not null default 0,
  emailed int not null default 0,
  sms_sent int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists area_waitlist_sends_once
  on area_waitlist_sends (user_id, daycare_id, spot_key);

create index if not exists area_waitlist_sends_user_idx
  on area_waitlist_sends (user_id, created_at desc);

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'search_alert_notices_kind_chk'
  ) then
    alter table search_alert_notices drop constraint search_alert_notices_kind_chk;
  end if;
  alter table search_alert_notices
    add constraint search_alert_notices_kind_chk
    check (kind in ('new_centre', 'vacancy_reconfirmed', 'waitlist_pulse', 'request_reply', 'area_waitlist'));
end $$;
