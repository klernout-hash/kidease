-- Daily-log and learning-story photos can be stored as private R2 keys.
-- FEATURE_PRIVATE_MEDIA stays off until Kyle turns it on.
-- Public URLs are not added here.

alter table daily_journals add column if not exists media_private boolean not null default false;

create table if not exists learning_stories (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  child_id text,
  parent_user_id text,
  author_user_id text not null,
  title text not null default '',
  body text not null default '',
  photos jsonb not null default '[]'::jsonb,
  media_private boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists learning_stories_daycare_idx
  on learning_stories (daycare_id, created_at desc);
