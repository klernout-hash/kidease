-- Honest alerts: school-age saved searches, request_reply notices,
-- digest email bookkeeping, 72h / daily-cap send log.
-- FEATURE_PUSH and FEATURE_SMS stay off. This does not add FCM or Twilio sends.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'saved_searches_age_band_chk'
  ) then
    alter table saved_searches drop constraint saved_searches_age_band_chk;
  end if;
  alter table saved_searches
    add constraint saved_searches_age_band_chk
    check (age_band in ('any', 'infant', 'toddler', 'preschool', 'school-age'));
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'waitlist_interests_age_band_chk'
  ) then
    alter table waitlist_interests drop constraint waitlist_interests_age_band_chk;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_name = 'waitlist_interests'
  ) then
    alter table waitlist_interests
      add constraint waitlist_interests_age_band_chk
      check (age_band in ('any', 'infant', 'toddler', 'preschool', 'school-age'));
  end if;
end $$;

alter table search_alert_prefs
  add column if not exists last_email_at timestamptz;

alter table search_alert_notices
  add column if not exists link_path text;

alter table search_alert_candidates
  add column if not exists email_notified int not null default 0;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'search_alert_notices_kind_chk'
  ) then
    alter table search_alert_notices drop constraint search_alert_notices_kind_chk;
  end if;
  alter table search_alert_notices
    add constraint search_alert_notices_kind_chk
    check (kind in ('new_centre', 'vacancy_reconfirmed', 'waitlist_pulse', 'request_reply'));
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'search_alert_candidates_kind_chk'
  ) then
    alter table search_alert_candidates drop constraint search_alert_candidates_kind_chk;
  end if;
  alter table search_alert_candidates
    add constraint search_alert_candidates_kind_chk
    check (kind in ('new_centre', 'vacancy_reconfirmed', 'request_reply'));
end $$;

create table if not exists search_alert_channel_sends (
  id text primary key,
  user_id text not null,
  saved_search_id text,
  daycare_id text,
  kind text not null,
  channel text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'search_alert_channel_sends_channel_chk'
  ) then
    alter table search_alert_channel_sends
      add constraint search_alert_channel_sends_channel_chk
      check (channel in ('email', 'in_app', 'push', 'sms'));
  end if;
end $$;

create index if not exists search_alert_channel_sends_user_idx
  on search_alert_channel_sends (user_id, created_at desc);

create index if not exists search_alert_channel_sends_search_idx
  on search_alert_channel_sends (saved_search_id, channel, created_at desc);
