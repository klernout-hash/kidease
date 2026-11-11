-- Centre lead tracker and the per-centre API.
-- One row per family per centre. Child health is not stored here.
-- FEATURE_CENTRE_LEAD_TRACKER and FEATURE_CENTRE_API stay off until set.

create table if not exists centre_leads (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  parent_user_id text,
  contact_name text,
  contact_email text,
  contact_phone text,
  child_label text,
  age_group text,
  desired_start text,
  source text not null default 'inquiry',
  stage text not null default 'inquiry',
  auto_stage text,
  auto_rule text,
  stage_locked boolean not null default false,
  lost_reason text,
  assigned_user_id text,
  reached_inquiry boolean not null default false,
  reached_tour boolean not null default false,
  reached_toured boolean not null default false,
  reached_applied boolean not null default false,
  reached_enrolled boolean not null default false,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  tour_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists centre_leads_parent_uidx
  on centre_leads (daycare_id, parent_user_id)
  where parent_user_id is not null;

create unique index if not exists centre_leads_email_uidx
  on centre_leads (daycare_id, lower(contact_email))
  where parent_user_id is null and contact_email is not null;

create index if not exists centre_leads_daycare_stage_idx
  on centre_leads (daycare_id, stage, updated_at desc);

create table if not exists centre_lead_events (
  id text primary key,
  lead_id text not null references centre_leads(id) on delete cascade,
  daycare_id text not null,
  from_stage text,
  to_stage text not null,
  rule_id text not null,
  lost_reason text,
  actor_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists centre_lead_events_lead_idx
  on centre_lead_events (lead_id, created_at);

create table if not exists centre_lead_notes (
  id text primary key,
  lead_id text not null references centre_leads(id) on delete cascade,
  daycare_id text not null,
  author_user_id text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists centre_lead_notes_lead_idx
  on centre_lead_notes (lead_id, created_at desc);

create table if not exists centre_lead_alerts (
  id text primary key,
  daycare_id text not null,
  lead_id text not null,
  kind text not null,
  dedupe_key text not null unique,
  outbound text not null default 'held',
  created_at timestamptz not null default now()
);

create table if not exists centre_lead_settings (
  daycare_id text primary key references daycares(id) on delete cascade,
  stale_days int not null default 3,
  enabled_at timestamptz not null default now()
);

create table if not exists centre_api_keys (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text not null,
  created_by text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists centre_api_keys_daycare_idx
  on centre_api_keys (daycare_id, created_at desc);

create table if not exists centre_api_audit (
  id text primary key,
  daycare_id text not null,
  key_id text,
  action text not null,
  status int not null,
  created_at timestamptz not null default now()
);

create index if not exists centre_api_audit_daycare_idx
  on centre_api_audit (daycare_id, created_at desc);

create table if not exists centre_api_hits (
  key_id text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key_id, window_start)
);

create table if not exists centre_webhooks (
  daycare_id text primary key references daycares(id) on delete cascade,
  url text not null,
  secret text not null,
  enabled boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists centre_webhook_deliveries (
  id text primary key,
  daycare_id text not null,
  lead_id text not null,
  event_key text not null unique,
  attempt int not null default 0,
  next_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists centre_webhook_due_idx
  on centre_webhook_deliveries (status, next_at);
