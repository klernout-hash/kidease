-- Parent absence updates attendance. Ratio uses children still marked present.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists absence_reports (
  id text primary key,
  daycare_id text not null,
  parent_user_id text not null,
  child_name text not null,
  day date not null,
  province text not null,
  band text not null,
  children_now int,
  ratio_status text,
  created_at timestamptz not null default now()
);

create index if not exists absence_reports_centre_idx on absence_reports (daycare_id, day);
