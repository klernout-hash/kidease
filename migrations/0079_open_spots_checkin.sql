-- Weekly open-spots check-in. No fee. 3 means three or more.
alter table daycares add column if not exists confirmed_open_spots smallint;

alter table daycares drop constraint if exists daycares_confirmed_open_spots_chk;
alter table daycares add constraint daycares_confirmed_open_spots_chk
  check (confirmed_open_spots is null or (confirmed_open_spots >= 0 and confirmed_open_spots <= 3));

create table if not exists open_spots_checkins (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  band smallint not null check (band >= 0 and band <= 3),
  views_week int not null default 0,
  split_known boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists open_spots_checkins_daycare_idx
  on open_spots_checkins (daycare_id, created_at desc);

create table if not exists open_spots_checkin_sends (
  daycare_id text not null references daycares(id) on delete cascade,
  week text not null,
  channel text not null check (channel in ('email', 'sms')),
  created_at timestamptz not null default now(),
  primary key (daycare_id, week, channel)
);
