-- Staff job board: structured job posts on the existing centre_job_posts table.
-- Additive columns only. Older posts keep working with blank values.
-- Pay is per hour, in cents. FEATURE_STAFF_JOB_BOARD stays off.
-- To undo: see migrations/down/0221_staff_job_posts.sql

alter table centre_job_posts add column if not exists cert_needed text not null default '';
alter table centre_job_posts add column if not exists province text not null default '';
alter table centre_job_posts add column if not exists care_groups text not null default '';
alter table centre_job_posts add column if not exists days text not null default '';
alter table centre_job_posts add column if not exists shifts text not null default '';
alter table centre_job_posts add column if not exists work_type text not null default '';
alter table centre_job_posts add column if not exists start_date date;
alter table centre_job_posts add column if not exists pay_min_cents int;
alter table centre_job_posts add column if not exists pay_max_cents int;
alter table centre_job_posts add column if not exists about text not null default '';
alter table centre_job_posts add column if not exists board int not null default 0;
