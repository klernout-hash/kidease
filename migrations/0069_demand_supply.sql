-- Ranking groundwork. City and age group only. No names, emails, phones, or messages.

create table if not exists ranking_events (
  id text primary key,
  name text not null,
  city text not null default '',
  age_group text not null default 'any',
  filters text not null default '',
  sort text not null default 'distance',
  result_count int,
  listing_id text not null default '',
  position int,
  variant text not null default 'nearest',
  created_at timestamptz not null default now()
);

create index if not exists ranking_events_created_idx on ranking_events (created_at desc);
create index if not exists ranking_events_city_idx on ranking_events (city, age_group, created_at desc);

create table if not exists demand_supply_daily (
  day date not null,
  city text not null,
  age_group text not null,
  searches int not null default 0,
  saves int not null default 0,
  spot_requests int not null default 0,
  listings int not null default 0,
  confirmed_openings int not null default 0,
  primary key (day, city, age_group)
);

create index if not exists demand_supply_daily_day_idx on demand_supply_daily (day desc, searches desc);
