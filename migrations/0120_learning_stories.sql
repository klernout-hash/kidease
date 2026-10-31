-- Private learning stories. One child, enrolled parents only.
-- Text only. is_private stays 1. Hidden until FEATURE_LEARNING_PORTFOLIOS is on.

create table if not exists learning_stories (
  id text primary key,
  daycare_id text not null,
  child_id text not null,
  title text not null,
  body text not null,
  framework text not null,
  domain text not null,
  observed_on date not null,
  is_private int not null default 1,
  author_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists learning_stories_child_idx on learning_stories (child_id, observed_on desc);
create index if not exists learning_stories_centre_idx on learning_stories (daycare_id, created_at desc);
