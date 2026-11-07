-- Draft-only policy, acceptance snapshots, disputes, and frozen shadow scores.
-- in_force stays false. Nothing here charges a fee or changes search order.
create table if not exists draft_cancellation_policies (
  id text primary key,
  daycare_id text not null,
  province text not null,
  program text not null,
  topic text not null,
  body text not null,
  status text not null default 'counsel-review',
  in_force boolean not null default false,
  version int not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint draft_policy_not_in_force check (in_force = false),
  constraint draft_policy_status check (status = 'counsel-review')
);

create table if not exists draft_policy_acceptances (
  id text primary key,
  policy_id text not null,
  policy_version int not null,
  body_snapshot text not null,
  user_id text not null,
  place_status text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (policy_id, policy_version, user_id)
);

create table if not exists draft_disputes (
  id text primary key,
  support_reference text not null,
  user_id text not null,
  status text not null,
  evidence_note text not null,
  created_at timestamptz not null default now(),
  constraint draft_dispute_status check (status in ('open', 'human-review', 'closed'))
);

create table if not exists draft_shadow_ranks (
  id text primary key,
  daycare_id text not null,
  rate numeric,
  frozen boolean not null default true,
  created_at timestamptz not null default now(),
  constraint draft_shadow_frozen check (frozen = true)
);
