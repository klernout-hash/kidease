-- Per-category notice choices. Tips default off. SMS defaults off.
-- Unsubscribe covers every category.

create table if not exists lifecycle_prefs (
  user_id text primary key,
  prefs jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists lifecycle_milestones (
  user_id text not null,
  child_id text not null,
  month int not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, child_id, month)
);
