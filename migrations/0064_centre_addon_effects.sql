-- Each daycare add-on names one centre. Featured city, Claim boost, and
-- Job post stay off the centre plan subscription and off Parent Plus.

alter table profiles
  add column if not exists featured_city_centre_id text,
  add column if not exists claim_boost_centre_id text,
  add column if not exists job_post_centre_id text;

create table if not exists centre_job_posts (
  id text primary key,
  daycare_id text not null,
  user_id text not null,
  role text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists centre_job_posts_daycare_idx
  on centre_job_posts (daycare_id, created_at desc);

-- One row per paid Job post. Spending marks spent_at. A credit for centre A
-- cannot be used on centre B.
create table if not exists centre_job_credits (
  payment_id text primary key,
  user_id text not null,
  daycare_id text,
  spent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists centre_job_credits_open_idx
  on centre_job_credits (user_id, created_at)
  where spent_at is null;
