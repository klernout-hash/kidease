-- Who read, saved, shared, or deleted a child profile.
-- The log stores ids and an action. It does not store names, birthdates, or health text.
-- Child profiles are collected again. Migration 0105 did not drop any table.

create table if not exists child_profile_access (
  id text primary key,
  child_id text not null,
  actor_id text not null,
  action text not null,
  daycare_id text,
  created_at timestamptz not null default now()
);

create index if not exists child_profile_access_child_idx
  on child_profile_access (child_id, created_at desc);

comment on table child_profile_access is
  'Parent-owned child profile access. Health columns on children are sealed when CHILD_HEALTH_KEY is set. A centre sees a profile only after the parent enrols or shares with consent.';
