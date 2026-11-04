-- KidEase Top Rated status. Reversible. Does not change listing facts.

create table if not exists top_rated_status (
  daycare_id text primary key,
  status text not null,
  since timestamptz,
  last_evaluated_at timestamptz not null default now(),
  next_review_at timestamptz,
  criteria_json text not null default '{}',
  check (status in ('pass', 'fail', 'revoked'))
);

create table if not exists top_rated_history (
  id text primary key,
  daycare_id text not null,
  status text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists top_rated_history_daycare_idx
  on top_rated_history (daycare_id, created_at desc);
