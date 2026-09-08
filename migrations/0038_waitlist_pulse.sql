-- Waitlist pulse: parent opt-in + centre "spot open" events + delivery log.
-- SMS still requires FEATURE_SMS + stored CASL consent. FEATURE_PUSH stays off.
-- One pulse row is one spot event. Fan-out is idempotent on (pulse_id, user_id, channel).

create table if not exists waitlist_interests (
  id text primary key,
  user_id text not null,
  daycare_id text not null,
  age_band text not null default 'any',
  saved_search_id text references saved_searches(id) on delete set null,
  notify_in_app int not null default 1,
  notify_sms int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_interests_age_band_chk'
  ) then
    alter table waitlist_interests
      add constraint waitlist_interests_age_band_chk
      check (age_band in ('any', 'infant', 'toddler', 'preschool'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_interests_in_app_chk'
  ) then
    alter table waitlist_interests
      add constraint waitlist_interests_in_app_chk
      check (notify_in_app in (0, 1));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_interests_sms_chk'
  ) then
    alter table waitlist_interests
      add constraint waitlist_interests_sms_chk
      check (notify_sms in (0, 1));
  end if;
end $$;

create unique index if not exists waitlist_interests_user_daycare_uidx
  on waitlist_interests (user_id, daycare_id);

create index if not exists waitlist_interests_daycare_idx
  on waitlist_interests (daycare_id, updated_at desc);

create table if not exists waitlist_pulses (
  id text primary key,
  daycare_id text not null,
  actor_user_id text not null,
  spots_infant int not null default 0,
  spots_toddler int not null default 0,
  spots_preschool int not null default 0,
  source text not null default 'director',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_pulses_source_chk'
  ) then
    alter table waitlist_pulses
      add constraint waitlist_pulses_source_chk
      check (source in ('director', 'capacity'));
  end if;
end $$;

create index if not exists waitlist_pulses_daycare_idx
  on waitlist_pulses (daycare_id, created_at desc);

-- Delivery log / idempotency. Retries must not double-text a parent.
create table if not exists waitlist_pulse_deliveries (
  id text primary key,
  pulse_id text not null references waitlist_pulses(id) on delete cascade,
  user_id text not null,
  daycare_id text not null,
  channel text not null,
  status text not null,
  match_source text not null,
  detail text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_pulse_deliveries_channel_chk'
  ) then
    alter table waitlist_pulse_deliveries
      add constraint waitlist_pulse_deliveries_channel_chk
      check (channel in ('in_app', 'sms'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_pulse_deliveries_status_chk'
  ) then
    alter table waitlist_pulse_deliveries
      add constraint waitlist_pulse_deliveries_status_chk
      check (status in ('sent', 'skipped', 'stubbed', 'failed'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_pulse_deliveries_source_chk'
  ) then
    alter table waitlist_pulse_deliveries
      add constraint waitlist_pulse_deliveries_source_chk
      check (match_source in ('listing_opt_in', 'saved_search', 'waitlist_booking'));
  end if;
end $$;

create unique index if not exists waitlist_pulse_deliveries_uidx
  on waitlist_pulse_deliveries (pulse_id, user_id, channel);

create index if not exists waitlist_pulse_deliveries_user_idx
  on waitlist_pulse_deliveries (user_id, created_at desc);

-- Family-desk notices already live on search_alert_notices. Allow waitlist_pulse.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'search_alert_notices_kind_chk'
  ) then
    alter table search_alert_notices drop constraint search_alert_notices_kind_chk;
  end if;
  alter table search_alert_notices
    add constraint search_alert_notices_kind_chk
    check (kind in ('new_centre', 'vacancy_reconfirmed', 'waitlist_pulse'));
end $$;
