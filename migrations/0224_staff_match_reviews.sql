-- Staff job board: Quebec Law 25. Anyone can ask a person at KidEase to review
-- an automated match. KidEase answers within 30 days.
-- To undo: see migrations/down/0224_staff_match_reviews.sql

create table if not exists staff_match_review_requests (
  id text primary key,
  user_id text not null,
  side text not null,
  job_id text,
  message text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (side in ('staff', 'provider')),
  check (status in ('open', 'answered'))
);

create index if not exists staff_match_review_requests_open_idx
  on staff_match_review_requests (status, created_at);
