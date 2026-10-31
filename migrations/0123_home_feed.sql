-- Saved parent feed preferences and distinct listing viewers.
-- A viewer key is a hash. The public page never reads it.

create table if not exists parent_feed_prefs (
  user_id text primary key,
  city text not null,
  province text not null,
  child_age_months int,
  start_date date,
  updated_at timestamptz not null default now()
);

create table if not exists listing_viewers (
  listing_id text not null,
  city_key text not null,
  viewer_key text not null,
  primary key (listing_id, viewer_key)
);

create index if not exists listing_viewers_city_idx on listing_viewers (city_key, listing_id);
