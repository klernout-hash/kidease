-- Quality score (0–100) and Guest Favorites.
-- Score is computed in-app from real signals only (src/lib/quality.ts):
--   claim / licence trust, listing completeness, vacancy freshness,
--   gated parent-review average + count, reply / tour-accept rates
--   when the sample is large enough.
-- KidEase never invents ratings. Guest Favorites is hidden when the metro
-- sample is too thin. Soft demotion only — listings stay searchable.

alter table daycares
  add column if not exists quality_score smallint,
  add column if not exists quality_scored_at timestamptz,
  add column if not exists guest_favorite boolean not null default false;

comment on column daycares.quality_score is
  '0-100 computed from claim/licence, completeness, vacancy freshness, gated parent reviews, and response/tour rates when sample is large enough. Never invented.';

comment on column daycares.guest_favorite is
  'True only when this listing is in the top percentile of its metro and min sample thresholds are met. Hidden when the metro is too thin.';

create index if not exists daycares_guest_favorite_idx
  on daycares (guest_favorite)
  where guest_favorite = true;
