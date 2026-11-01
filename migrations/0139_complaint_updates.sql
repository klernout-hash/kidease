-- Complaint updates from government to the parent who filed.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists complaint_updates (
  id text primary key,
  source text not null,
  report_id text not null,
  province text not null,
  parent_user_id text not null,
  note text not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  check (source in ('gov_complaints', 'safety_reports'))
);

create index if not exists complaint_updates_parent_idx
  on complaint_updates (parent_user_id, created_at desc);
