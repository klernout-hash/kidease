-- PIPEDA / Law 25 request tracking. Does not delete the session.
-- A retention_holds row with released_at null blocks deletion.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists dsr_requests (
  id text primary key,
  user_id text not null,
  kind text not null,
  status text not null,
  province text,
  held int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind in ('export', 'delete')),
  check (status in ('received', 'with_roles', 'blocked', 'done'))
);

create table if not exists dsr_tasks (
  id text primary key,
  request_id text not null references dsr_requests(id) on delete cascade,
  role text not null,
  status text not null default 'open',
  done_by text,
  done_at timestamptz
);

create index if not exists dsr_requests_user_idx on dsr_requests (user_id, created_at desc);
