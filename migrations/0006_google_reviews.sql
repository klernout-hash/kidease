alter table daycares add column if not exists google_place_id text;
alter table daycares add column if not exists google_rating_x10 integer;
alter table daycares add column if not exists google_review_count integer;
alter table daycares add column if not exists google_synced_at timestamptz;
