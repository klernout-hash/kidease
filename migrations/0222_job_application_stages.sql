-- Staff job board: steps the staff member can see, and provider invites.
-- The old status column (new / reviewed / declined) stays as it is.
-- The provider sets every step. Nothing moves to not_selected by itself.
-- To undo: see migrations/down/0222_job_application_stages.sql

alter table job_applications add column if not exists stage text not null default 'applied';
alter table job_applications add column if not exists stage_at timestamptz;
alter table job_applications add column if not exists source text not null default 'apply';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_applications_stage_chk') then
    alter table job_applications
      add constraint job_applications_stage_chk
      check (stage in ('applied', 'viewed', 'interview', 'offer', 'hired', 'not_selected'));
  end if;
end $$;

create table if not exists staff_job_invites (
  id text primary key,
  job_id text not null,
  daycare_id text not null,
  staff_user_id text not null,
  invited_by text not null,
  status text not null default 'sent',
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (status in ('sent', 'accepted', 'declined'))
);

create unique index if not exists staff_job_invites_job_user_uidx
  on staff_job_invites (job_id, staff_user_id);
create index if not exists staff_job_invites_user_idx
  on staff_job_invites (staff_user_id, status);
