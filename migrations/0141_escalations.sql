-- Escalation clock. Hours are stored per item. No default SLA.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists escalation_items (
  id text primary key,
  kind text not null,
  ref_id text not null default '',
  province text not null default '',
  opened_by text not null,
  sla_hours int not null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  escalated_at timestamptz,
  check (sla_hours between 1 and 720)
);

create table if not exists escalation_parties (
  item_id text not null references escalation_items(id) on delete cascade,
  user_id text not null,
  role text not null,
  primary key (item_id, user_id)
);
