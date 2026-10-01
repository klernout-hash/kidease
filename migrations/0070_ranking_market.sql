-- Anonymous search counts for the nightly demand table.
-- No user id, child name, email, phone, or message.

create table if not exists ranking_search_facts (
  id text primary key,
  city text not null,
  age_group text not null,
  created_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists ranking_search_facts_day_idx
  on ranking_search_facts (created_on, city, age_group);

create table if not exists ranking_market_daily (
  city text not null,
  age_group text not null,
  as_of date not null,
  searches int not null,
  saves int not null,
  spot_requests int not null,
  listings int not null,
  confirmed_openings int not null,
  primary key (city, age_group, as_of)
);
