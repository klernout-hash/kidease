-- Inspection sync reuses listing_inspections. A row still needs a public source.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists inspection_sync_log (
  id text primary key,
  province text not null,
  licence_number text not null,
  inspected_on date not null,
  actor_id text not null,
  created_at timestamptz not null default now()
);
