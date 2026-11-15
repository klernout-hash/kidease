-- Seen and dismissed first-run tours, per account.
-- Nothing here sends email, SMS, or push.
-- Undo: migrations/down/0204_first_run_onboarding.sql

create table if not exists onboarding_progress (
  user_id text not null,
  item_key text not null,
  seen_at timestamptz,
  dismissed_at timestamptz,
  primary key (user_id, item_key)
);

create index if not exists onboarding_progress_user_idx
  on onboarding_progress (user_id);
