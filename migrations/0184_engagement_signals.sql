-- Coarse engagement counts. No message text, names, or child details.
create table if not exists engagement_events (
  id text primary key,
  dedupe_key text not null unique,
  event_name text not null,
  actor_hash text not null,
  centre_hash text not null,
  thread_hash text not null,
  role text not null,
  environment text not null,
  response_seconds integer,
  tour_outcome text,
  created_at timestamptz not null default now(),
  check (event_name in ('inquiry_sent', 'provider_reply', 'tour_outcome', 'thread_return_7d')),
  check (role in ('parent', 'provider', 'staff')),
  check (environment in ('production', 'preview', 'test'))
);

alter table conversations add column if not exists assigned_user_id text;
alter table conversations add column if not exists follow_up_on date;

-- Held files. Clean is not a status: there is no scanner yet.
create table if not exists thread_files (
  id text primary key,
  conversation_id text not null,
  uploaded_by text not null,
  mime text not null,
  byte_size integer not null,
  status text not null default 'quarantine',
  created_at timestamptz not null default now(),
  check (status = 'quarantine'),
  check (byte_size > 0 and byte_size <= 5242880)
);
