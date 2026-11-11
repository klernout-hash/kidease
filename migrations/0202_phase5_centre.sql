-- Phase 5. No mail, text, or push is sent from these tables.
create table if not exists centre_events (
  id text primary key,
  daycare_id text not null,
  title text not null,
  starts_at timestamptz not null,
  room_id text,
  created_at timestamptz not null default now()
);

create table if not exists centre_event_rsvps (
  id text primary key,
  event_id text not null,
  parent_user_id text not null,
  answer text not null,
  headcount int not null default 0,
  created_at timestamptz not null default now(),
  check (answer in ('yes', 'no', 'maybe'))
);

create table if not exists immunization_files (
  id text primary key,
  child_id text not null,
  owner_user_id text not null,
  daycare_id text not null,
  kind text not null,
  expires_on date,
  created_at timestamptz not null default now(),
  check (kind in ('record', 'exemption'))
);

create table if not exists immunization_views (
  id text primary key,
  child_id text not null,
  viewer_id text not null,
  seen_at timestamptz not null default now()
);
