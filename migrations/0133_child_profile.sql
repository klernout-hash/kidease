-- Shared child profile details. Health text stays on children and is sealed
-- by the app. Pickup names are for the enrolled daycare only.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists child_care_people (
  id text primary key,
  child_id text not null,
  kind text not null,
  name text not null,
  phone text not null default '',
  relationship text not null default '',
  created_at timestamptz not null default now(),
  check (kind in ('pickup', 'emergency'))
);

create index if not exists child_care_people_child_idx on child_care_people (child_id, kind);

create table if not exists child_profile_shares (
  child_id text not null,
  daycare_id text not null,
  shared int not null default 0,
  primary key (child_id, daycare_id)
);

create table if not exists child_pickup_checks (
  id text primary key,
  child_id text not null,
  daycare_id text not null,
  person_name text not null,
  ok int not null,
  created_at timestamptz not null default now()
);
