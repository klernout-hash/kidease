-- A safety report can point at a parent review.
-- The queue labels that row as a review and uses review actions.

alter table safety_reports add column if not exists review_id text;

create index if not exists safety_reports_review_idx
  on safety_reports (review_id)
  where review_id is not null;
