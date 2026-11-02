-- Daycare and org desks manage ECE postings. FEATURE_ECE_JOBS stays off.
-- Closing a posting hides it from browse. No fee and no checkout.

alter table centre_job_posts add column if not exists status text not null default 'open';
alter table job_applications add column if not exists status text not null default 'new';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'centre_job_posts_status_chk') then
    alter table centre_job_posts
      add constraint centre_job_posts_status_chk
      check (status in ('open', 'closed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_applications_status_chk') then
    alter table job_applications
      add constraint job_applications_status_chk
      check (status in ('new', 'reviewed', 'declined'));
  end if;
end $$;
