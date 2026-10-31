-- Automation pack: idempotent sends, run log, error counts, hidden open spots.
-- No CRM tables. Sends stay off until a feature flag and its _LIVE switch are on.

create table if not exists automation_sends (
  automation text not null,
  dedupe_key text not null,
  channel text not null,
  recipient text not null,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (automation, dedupe_key, channel)
);

create index if not exists automation_sends_recipient_idx
  on automation_sends (recipient, channel, created_at desc);

create table if not exists automation_runs (
  id text primary key,
  automation text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail text
);

create index if not exists automation_runs_started_idx
  on automation_runs (started_at desc);

create table if not exists automation_error_counts (
  bucket timestamptz not null,
  source text not null,
  count int not null default 0,
  primary key (bucket, source)
);

alter table daycares
  add column if not exists open_spots_hidden_at timestamptz;

comment on column daycares.open_spots_hidden_at is
  'Set when open spots were not updated for 30 days. Cleared when a provider confirms spots. Parents do not see a fresh count while this is set.';
