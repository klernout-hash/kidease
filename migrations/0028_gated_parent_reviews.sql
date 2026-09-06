-- PR F: gated parent micro-reviews.
--
-- Gate (enforced in src/lib/server/reviews.ts, rules in src/lib/review-gate.ts):
--   A parent may submit a review for a centre only when one of these is true:
--     1. bookings.status in ('accepted', 'active') for that parent + centre
--        (confirmed enrolment — not a spot request, waitlist, or tour inquiry)
--     2. attendance.parent_user_id matches that parent + centre
--        (confirmed in-care relationship)
--     3. reviewer_grants row for that parent + centre
--        (admin-granted: tour completed offline, or a relationship KidEase
--        cannot see yet. There is no tour-completed table.)
--   A user in provider_daycares for that centre cannot write a review.
--
-- Moderation: pending → published | hidden. Admin hide is first-class.
-- Legacy approved / rejected rows are rewritten to published / hidden.
-- Public listing + search cards show published reviews only (average + count).
-- KidEase does not invent star ratings.

update reviews set status = 'published' where status = 'approved';
update reviews set status = 'hidden' where status = 'rejected';

alter table reviews drop constraint if exists reviews_status_check;
alter table reviews
  add constraint reviews_status_check
  check (status in ('pending', 'published', 'hidden'));

alter table reviews
  add column if not exists gate_reason text;

comment on column reviews.gate_reason is
  'enrolment | attendance | grant — why submitListingReview allowed this row. Null on pre-gate imports.';

create table if not exists reviewer_grants (
  user_id text not null,
  daycare_id text not null references daycares(id) on delete cascade,
  granted_by text,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, daycare_id)
);

create index if not exists reviewer_grants_daycare_idx
  on reviewer_grants (daycare_id);

comment on table reviewer_grants is
  'Admin-granted reviewer flag. Use when enrolment/attendance is missing (e.g. tour completed offline).';
