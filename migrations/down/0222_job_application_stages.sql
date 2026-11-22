drop index if exists staff_job_invites_user_idx;
drop index if exists staff_job_invites_job_user_uidx;
drop table if exists staff_job_invites;
alter table job_applications drop constraint if exists job_applications_stage_chk;
alter table job_applications drop column if exists source;
alter table job_applications drop column if exists stage_at;
alter table job_applications drop column if exists stage;
