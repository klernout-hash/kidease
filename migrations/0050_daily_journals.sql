-- Daily care journals (text + photos). No video in this phase.
-- Attendance already lives in 0012_attendance.sql.

create table if not exists daily_journals (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  author_user_id text not null,
  day date not null,
  body text not null default '',
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_journals_daycare_day_idx
  on daily_journals (daycare_id, day desc, created_at desc);

create index if not exists daily_journals_parent_day_idx
  on daily_journals (parent_user_id, day desc, created_at desc);

create index if not exists daily_journals_booking_idx
  on daily_journals (booking_id);
