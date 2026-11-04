-- Listing gaps for the host desk. FEATURE_HOST_LISTING stays off.
-- One row per daycare account and centre. Email is at most weekly.
-- Reverse: migrations/down/0172_host_action_notices.sql

create table if not exists host_action_notices (
  user_id text not null,
  daycare_id text not null,
  fingerprint text not null default '',
  first_at timestamptz,
  last_at timestamptz,
  email_opt_out boolean not null default false,
  primary key (user_id, daycare_id)
);
