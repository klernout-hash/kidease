-- Host listing calendar. FEATURE_HOST_LISTING stays off.
-- A row is one centre day. Today's row is also copied onto the public spot counts.
-- Reverse: migrations/down/0171_host_calendar.sql

create table if not exists host_calendar_days (
  daycare_id text not null references daycares(id) on delete cascade,
  day date not null,
  spots_infant int not null default 0,
  spots_toddler int not null default 0,
  spots_preschool int not null default 0,
  closed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (daycare_id, day),
  constraint host_calendar_spots_chk check (
    spots_infant >= 0 and spots_infant <= 200
    and spots_toddler >= 0 and spots_toddler <= 200
    and spots_preschool >= 0 and spots_preschool <= 200
  )
);

create index if not exists host_calendar_days_day_idx
  on host_calendar_days (daycare_id, day);

create table if not exists daycare_family_guides (
  daycare_id text primary key references daycares(id) on delete cascade,
  dropoff_note text not null default '',
  bring_note text not null default '',
  handbook_note text not null default '',
  updated_at timestamptz not null default now()
);
