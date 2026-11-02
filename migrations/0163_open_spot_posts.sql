-- Open spots posted by age group. FEATURE_AGE_OPEN_SPOTS stays off.
-- Notices use the existing mail and push path. No checkout.

create table if not exists open_spot_posts (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  age_group text not null,
  spots int not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (age_group in ('infant', 'toddler', 'preschool')),
  check (spots >= 0 and spots <= 99)
);

create index if not exists open_spot_posts_daycare_idx
  on open_spot_posts (daycare_id, created_at desc);

create table if not exists open_spot_notices (
  id text primary key,
  post_id text not null references open_spot_posts(id) on delete cascade,
  user_id text not null,
  source text not null,
  created_at timestamptz not null default now(),
  check (source in ('saved', 'waitlist'))
);

create unique index if not exists open_spot_notices_uidx
  on open_spot_notices (post_id, user_id);
