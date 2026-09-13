-- Tour calendar v1: centre-defined visit windows (not staff scheduling).
-- Parents book posted blocks; KidEase never invents tour slots.
-- Default timezone America/Winnipeg; a centre may override.

alter table daycares
  add column if not exists timezone text not null default 'America/Winnipeg';

create table if not exists tour_windows (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  window_date date not null,
  start_time text not null,
  end_time text not null,
  capacity int not null default 1,
  timezone text not null default 'America/Winnipeg',
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_windows_capacity_chk check (capacity >= 1 and capacity <= 12),
  constraint tour_windows_time_chk check (start_time < end_time)
);

create unique index if not exists tour_windows_unique_slot
  on tour_windows (daycare_id, window_date, start_time);

create index if not exists tour_windows_daycare_start_idx
  on tour_windows (daycare_id, start_at);

alter table tour_requests
  add column if not exists window_id text references tour_windows(id) on delete set null;

alter table tour_requests
  add column if not exists parent_first_name text;

alter table tour_requests
  add column if not exists parent_last_name text;

alter table tour_requests
  add column if not exists parent_phone text;

alter table tour_requests
  add column if not exists contact_email text;

create index if not exists tour_requests_window_idx
  on tour_requests (window_id, status);
