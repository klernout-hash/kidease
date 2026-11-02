-- Staff clock in and clock out. Hidden until FEATURE_STAFF_TIMESHEETS is on.
-- Edits keep a before and after. KidEase does not pay wages.

create table if not exists staff_time_entries (
  id text primary key,
  daycare_id text not null,
  staff_name text not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_time_entries_centre_idx
  on staff_time_entries (daycare_id, clock_in_at desc);

create table if not exists staff_time_edits (
  id text primary key,
  entry_id text not null,
  daycare_id text not null,
  actor_id text not null,
  field_name text not null,
  before_value text not null default '',
  after_value text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists staff_time_edits_entry_idx
  on staff_time_edits (entry_id, created_at);
