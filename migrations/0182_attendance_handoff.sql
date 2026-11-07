-- Day-scoped check-in rows, manager corrections, and a demo notice queue.
-- Nothing here sends email, SMS, or a push. A notice person cannot pick up.
-- Reverse: migrations/down/0182_attendance_handoff.sql

alter table child_check_events add column if not exists idempotency_key text;
alter table child_check_events add column if not exists local_day date;
alter table child_check_events add column if not exists correction_of text;
alter table child_check_events add column if not exists reason text not null default '';

create unique index if not exists child_check_events_idem
  on child_check_events (daycare_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists child_check_events_day_action
  on child_check_events (booking_id, local_day, action)
  where correction_of is null and booking_id is not null and local_day is not null;

create unique index if not exists child_check_events_one_correction
  on child_check_events (correction_of)
  where correction_of is not null;

create table if not exists child_notice_people (
  id text primary key,
  child_id text not null,
  name text not null,
  may_pickup boolean not null default false,
  created_at timestamptz not null default now(),
  constraint child_notice_not_pickup check (may_pickup = false)
);

create table if not exists attendance_notice_outbox (
  id text primary key,
  event_id text not null,
  daycare_id text not null,
  recipient_label text not null,
  channel text not null default 'demo',
  status text not null default 'held',
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (dedupe_key),
  constraint attendance_notice_demo check (channel = 'demo'),
  constraint attendance_notice_unsent check (status in ('held', 'skipped'))
);
