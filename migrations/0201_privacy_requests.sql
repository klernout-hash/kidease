-- Privacy request cases. No email is sent from this table.
create table if not exists privacy_requests (
  id text primary key,
  user_id text,
  kind text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (kind in ('access', 'correction', 'deletion'))
);
