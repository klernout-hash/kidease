-- Optional parent email-code and the daycare health-note grace start.
-- To undo: see migrations/down/0211_second_factor.sql

create table if not exists second_factor_prefs (
  user_id text primary key,
  parent_opt_in boolean not null default false,
  provider_grace_started_at timestamptz
);
