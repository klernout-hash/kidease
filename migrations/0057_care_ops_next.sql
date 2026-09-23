-- NEXT daily-care ops (claimed/enrolled only).
-- Medication schedules + append-only dose audit, incident reports,
-- rooms with capacity, and a same-day staff roster (not timesheets).
-- Attendance already lives in 0012_attendance.sql.
-- Journals already live in 0050_daily_journals.sql.

create table if not exists care_rooms (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  name text not null,
  capacity int not null default 8,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_rooms_capacity_chk check (capacity >= 1 and capacity <= 80)
);

create index if not exists care_rooms_daycare_idx
  on care_rooms (daycare_id, sort_order, name);

create table if not exists care_child_room_assignments (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  room_id text not null references care_rooms(id) on delete cascade,
  booking_id text,
  child_name text not null,
  parent_user_id text,
  assigned_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists care_child_rooms_child_idx
  on care_child_room_assignments (daycare_id, child_name);

create index if not exists care_child_rooms_room_idx
  on care_child_room_assignments (room_id);

create table if not exists care_roster_assignments (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  room_id text not null references care_rooms(id) on delete cascade,
  staff_user_id text not null,
  staff_name text not null,
  day date not null,
  assigned_by text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists care_roster_room_staff_day_idx
  on care_roster_assignments (room_id, staff_user_id, day);

create index if not exists care_roster_daycare_day_idx
  on care_roster_assignments (daycare_id, day);

create table if not exists care_medications (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  name text not null,
  dosage text not null,
  instructions text not null default '',
  schedule_times jsonb not null default '[]'::jsonb,
  start_day date not null,
  end_day date,
  created_by text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists care_medications_daycare_child_idx
  on care_medications (daycare_id, child_name, archived_at);

create index if not exists care_medications_parent_idx
  on care_medications (parent_user_id, start_day desc);

create table if not exists care_medication_logs (
  id text primary key,
  medication_id text not null references care_medications(id) on delete cascade,
  daycare_id text not null references daycares(id) on delete cascade,
  booking_id text,
  conversation_id text,
  child_name text not null,
  parent_user_id text,
  day date not null,
  scheduled_time text not null,
  status text not null,
  notes text not null default '',
  given_by text not null,
  given_by_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists care_medication_logs_med_day_idx
  on care_medication_logs (medication_id, day, created_at desc);

create index if not exists care_medication_logs_parent_idx
  on care_medication_logs (parent_user_id, day desc);

create table if not exists care_incidents (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  day date not null,
  occurred_at timestamptz not null,
  location text not null default '',
  kind text not null,
  description text not null,
  action_taken text not null default '',
  first_aid boolean not null default false,
  author_user_id text not null,
  author_name text not null default '',
  parent_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists care_incidents_daycare_day_idx
  on care_incidents (daycare_id, day desc, created_at desc);

create index if not exists care_incidents_parent_idx
  on care_incidents (parent_user_id, day desc);

create index if not exists care_incidents_booking_idx
  on care_incidents (booking_id);
