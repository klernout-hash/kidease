-- Door check-in and check-out with a timestamp. FEATURE_CHILD_CHECKIN stays off.
-- pickup_name is filled only when the parent already listed pickup people.

create table if not exists child_check_events (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  booking_id text,
  child_name text not null,
  parent_user_id text,
  action text not null,
  at timestamptz not null default now(),
  pickup_name text not null default '',
  recorded_by text not null,
  created_at timestamptz not null default now(),
  check (action in ('check_in', 'check_out'))
);

create index if not exists child_check_events_centre_idx
  on child_check_events (daycare_id, at desc);

create index if not exists child_check_events_parent_idx
  on child_check_events (parent_user_id, at desc);
