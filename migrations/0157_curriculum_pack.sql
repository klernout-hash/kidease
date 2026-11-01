-- Curriculum pack and Story Corner. Safe to run more than once.
-- Goal text is not copied from government frameworks.
-- Child photos, when used, are private keys. This file does not add a public photo URL.
-- Story files live on disk under data/story-corner/files. The table stores the hash and local path.

create table if not exists curriculum_story_meta (
  story_id text primary key,
  daycare_id text not null,
  province text not null,
  goal_ids jsonb not null default '[]'::jsonb,
  what_next text not null default '',
  age_band text not null default 'preschool',
  status text not null default 'draft',
  published_at timestamptz,
  photo_keys jsonb not null default '[]'::jsonb,
  home_activity_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists curriculum_story_meta_centre_idx
  on curriculum_story_meta (daycare_id, status);

create table if not exists curriculum_replies (
  id text primary key,
  story_id text not null,
  parent_user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists curriculum_replies_story_idx
  on curriculum_replies (story_id, created_at);

create table if not exists curriculum_plans (
  id text primary key,
  daycare_id text not null,
  province text not null,
  kind text not null,
  period_start date not null,
  room_label text not null default '',
  body text not null,
  goal_ids jsonb not null default '[]'::jsonb,
  author_user_id text not null,
  review_due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists curriculum_plans_once
  on curriculum_plans (daycare_id, kind, period_start, room_label);

create table if not exists curriculum_reminder_log (
  id text primary key,
  daycare_id text not null,
  plan_id text not null default '',
  kind text not null,
  due_on date not null,
  note text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists curriculum_reminder_once
  on curriculum_reminder_log (daycare_id, plan_id, kind, due_on);

create table if not exists story_corner_books (
  id text primary key,
  source text not null,
  source_key text not null,
  title text not null,
  language text not null,
  age_band text not null,
  licence text not null,
  licence_url text not null,
  credit text not null,
  sha256 text not null,
  local_path text not null,
  goal_ids jsonb not null default '[]'::jsonb,
  unmodified boolean not null default true,
  change_note text not null default '',
  creators jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists story_corner_books_source
  on story_corner_books (source, source_key);
