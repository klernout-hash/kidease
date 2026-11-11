-- Daycare CRM columns, custom stages, tasks, and workflow rules.
-- Mail and text stay off. No outside CRM.

alter table centre_leads add column if not exists schedule text;
alter table centre_leads add column if not exists room_wanted text;
alter table centre_leads add column if not exists next_step text;
alter table centre_leads add column if not exists last_contact_at timestamptz;

create table if not exists centre_pipeline_stages (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  stage_key text not null,
  label_en text not null,
  label_fr text not null,
  sort_order int not null,
  system boolean not null default false,
  unique (daycare_id, stage_key)
);

create index if not exists centre_pipeline_stages_order_idx
  on centre_pipeline_stages (daycare_id, sort_order);

create table if not exists centre_lead_tasks (
  id text primary key,
  daycare_id text not null,
  lead_id text not null references centre_leads(id) on delete cascade,
  assignee_user_id text,
  title text not null,
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists centre_crm_rules (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  kind text not null,
  stage_key text,
  idle_days int,
  enabled boolean not null default true,
  unique (daycare_id, kind, stage_key)
);
