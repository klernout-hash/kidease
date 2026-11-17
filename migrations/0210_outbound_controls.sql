-- Outbound safety: admin kill switches, daily caps and messaging test mode.
-- One row per setting. A missing row means the default in src/lib/outbound-controls.ts.
-- To undo: see migrations/down/0210_outbound_controls.sql

create table if not exists outbound_controls (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Sends counted per channel per America/Winnipeg day.
create table if not exists outbound_daily_usage (
  day date not null,
  channel text not null,
  used integer not null default 0,
  blocked integer not null default 0,
  alerted_at timestamptz,
  primary key (day, channel)
);

-- Every switch, cap or test-mode change.
create table if not exists outbound_control_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id text,
  actor_email text,
  key text not null,
  old_value text,
  new_value text
);

create index if not exists outbound_control_audit_at_idx on outbound_control_audit (at desc);
