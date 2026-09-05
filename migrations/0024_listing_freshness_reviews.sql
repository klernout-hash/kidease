-- Vacancy freshness, listing completeness (computed in app), and moderated parent reviews.
-- Composes with 0023_canada_trust.sql when that lands; this file does not depend on it.

alter table daycares
  add column if not exists last_vacancy_updated_at timestamptz;

comment on column daycares.last_vacancy_updated_at is
  'Set only when a provider confirms or edits open spots. Never backfilled from claimed_at.';

alter table reviews
  add column if not exists user_id text,
  add column if not exists status text not null default 'approved',
  add column if not exists locale text not null default 'en',
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

-- Existing seed/import rows stay public. New parent submissions start as pending.
update reviews set status = 'approved' where status is null or status = '';

alter table reviews drop constraint if exists reviews_status_check;
alter table reviews
  add constraint reviews_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists reviews_daycare_status_idx
  on reviews (daycare_id, status, created_at desc);

create index if not exists reviews_user_created_idx
  on reviews (user_id, created_at desc);

create table if not exists listing_review_attempts (
  id text primary key,
  daycare_id text not null,
  user_id text,
  created_at timestamptz not null default now()
);

create index if not exists listing_review_attempts_user_idx
  on listing_review_attempts (user_id, created_at desc);
