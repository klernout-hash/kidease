-- Shared parent + daycare arrival/departure calendar and live listing stamps.

alter table daycares add column if not exists spots_updated_at timestamptz;
alter table daycares add column if not exists contact_email text;

create table if not exists attendance (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  booking_id text,
  conversation_id text,
  child_name text not null,
  parent_user_id text,
  day date not null,
  drop_off text,
  pick_up text,
  status text not null default 'scheduled',
  notes text,
  updated_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_day_child_idx
  on attendance (daycare_id, child_name, day);

create index if not exists attendance_daycare_day_idx
  on attendance (daycare_id, day);

create index if not exists attendance_parent_idx
  on attendance (parent_user_id, day);
