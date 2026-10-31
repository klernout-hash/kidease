-- Applications for ECE roles posted on a centre profile.
-- FEATURE_ECE_JOBS stays off until Kyle turns it on.
-- Posting does not charge and does not turn on subscriptions.

create table if not exists job_applications (
  id text primary key,
  job_id text not null,
  daycare_id text not null,
  user_id text not null,
  name text not null,
  email text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists job_applications_user_job_uidx
  on job_applications (job_id, user_id);
