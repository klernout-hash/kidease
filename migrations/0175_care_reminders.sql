-- Per-parent drop-off and pick-up reminders. Adds tables only.
-- Reverse: migrations/down/0175_care_reminders.sql

create table if not exists care_reminders (
  user_id text not null,
  child_id text not null,
  master_on boolean not null default false,
  same_every_day boolean not null default true,
  lead_minutes int not null default 30,
  primary key (user_id, child_id),
  check (lead_minutes in (15, 30, 60))
);

create table if not exists care_reminder_days (
  user_id text not null,
  child_id text not null,
  weekday int not null,
  dropoff text,
  pickup text,
  dropoff_on boolean not null default false,
  pickup_on boolean not null default false,
  primary key (user_id, child_id, weekday),
  check (weekday between -1 and 6)
);

create table if not exists care_reminder_sends (
  id text primary key,
  user_id text not null,
  child_id text not null,
  kind text not null,
  local_date text not null,
  created_at timestamptz not null default now(),
  check (kind in ('dropoff', 'pickup'))
);

create unique index if not exists care_reminder_sends_once
  on care_reminder_sends (user_id, child_id, kind, local_date);
