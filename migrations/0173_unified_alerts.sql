-- Unified alerts. Reversible. Does not drop existing notification tables.
-- To undo:
--   drop table if exists unified_alert_events;
--   drop table if exists unified_alert_prefs;
--   drop table if exists unified_alert_settings;
--   alter table family_documents drop column if exists expires_on;
--   alter table children drop column if exists allergy_plan_expires_on;
--   drop index if exists staff_shifts_user_idx;
--   alter table staff_shifts drop column if exists staff_user_id;

create table if not exists unified_alert_settings (
  user_id text primary key,
  master_enabled int not null default 1,
  in_app int not null default 1,
  email_on int not null default 1,
  push_on int not null default 0,
  quiet_start text not null default '21:00',
  quiet_end text not null default '08:00',
  quiet_custom int not null default 0,
  time_zone text not null default 'America/Winnipeg',
  digest text not null default 'off',
  updated_at timestamptz not null default now(),
  check (digest in ('off', 'daily', 'weekly'))
);

create table if not exists unified_alert_prefs (
  user_id text not null,
  type_id text not null,
  enabled int not null default 1,
  primary key (user_id, type_id)
);

create table if not exists unified_alert_events (
  id text primary key,
  user_id text not null,
  type_id text not null,
  audience text not null,
  locale text not null default 'en',
  title text not null,
  body text not null,
  href text not null,
  dedupe_key text not null,
  daycare_id text,
  counterparty_user_id text,
  critical int not null default 0,
  status text not null default 'inbox',
  channels text not null default 'in_app',
  read_at timestamptz,
  emailed_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists unified_alert_events_dedupe
  on unified_alert_events (user_id, dedupe_key);

create index if not exists unified_alert_events_user_idx
  on unified_alert_events (user_id, created_at desc);

alter table family_documents add column if not exists expires_on date;
alter table children add column if not exists allergy_plan_expires_on date;
alter table staff_shifts add column if not exists staff_user_id text;

create index if not exists staff_shifts_user_idx
  on staff_shifts (staff_user_id, starts_at);
