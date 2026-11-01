-- Withdrawal notice period is stored by the daycare. No default period.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists daycare_notice_terms (
  daycare_id text primary key,
  notice_days int not null,
  updated_at timestamptz not null default now(),
  check (notice_days between 1 and 90)
);

create table if not exists withdrawals (
  id text primary key,
  daycare_id text not null,
  parent_user_id text not null,
  age_group text,
  requested_on date not null,
  last_day date not null,
  invoice_id text,
  space_freed int not null default 0,
  created_at timestamptz not null default now()
);
