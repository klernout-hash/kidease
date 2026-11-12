-- KidEase business leads for GoHighLevel. One row per user.
-- Contacts and opportunities only. No mail, no text, no centre CRM.

create table if not exists ghl_lead_pushes (
  user_id text primary key,
  email text not null,
  audience text not null,
  trigger text not null,
  contact_id text,
  opportunity_id text,
  result text not null,
  attempts int not null default 0,
  line_type text,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ghl_lead_reconcile (
  id text primary key,
  ran_at timestamptz not null default now(),
  window_hours int not null,
  checked int not null,
  missing_contact int not null,
  missing_opportunity int not null,
  missing_welcome int not null,
  retried int not null,
  detail jsonb not null
);
