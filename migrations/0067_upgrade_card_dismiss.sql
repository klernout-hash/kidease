-- Remember "Not now" on the role home upgrade card. One row per profile.
-- Session storage is not enough: the card must stay hidden on the next visit.

alter table profiles
  add column if not exists upgrade_card_dismissed_at timestamptz;
