-- Subsidy status tracker. KidEase does not approve the subsidy itself.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists subsidy_cases (
  id text primary key,
  parent_user_id text not null,
  daycare_id text not null,
  province text not null,
  status text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('submitted', 'in_review', 'approved', 'declined'))
);

create index if not exists subsidy_cases_parent_idx on subsidy_cases (parent_user_id, created_at desc);
create index if not exists subsidy_cases_province_idx on subsidy_cases (province, status);
