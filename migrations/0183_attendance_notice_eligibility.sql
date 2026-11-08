-- Real attendance notices for linked accounts. Demo rows stay held.
-- Nothing here sends email, SMS, or a push. A notice still cannot grant pickup.
-- Reverse: migrations/down/0183_attendance_notice_eligibility.sql

alter table attendance_notice_outbox add column if not exists recipient_user_id text;
alter table attendance_notice_outbox add column if not exists audience text not null default 'name_only';
alter table attendance_notice_outbox add column if not exists attempts int not null default 0;
alter table attendance_notice_outbox add column if not exists last_error text not null default '';
alter table attendance_notice_outbox add column if not exists updated_at timestamptz not null default now();

alter table attendance_notice_outbox drop constraint if exists attendance_notice_demo;
alter table attendance_notice_outbox drop constraint if exists attendance_notice_unsent;

alter table attendance_notice_outbox drop constraint if exists attendance_notice_channel;
alter table attendance_notice_outbox add constraint attendance_notice_channel
  check (channel in ('demo', 'account'));

alter table attendance_notice_outbox drop constraint if exists attendance_notice_status;
alter table attendance_notice_outbox add constraint attendance_notice_status
  check (
    (channel = 'demo' and status in ('held', 'skipped'))
    or (channel = 'account' and status in ('eligible', 'waiting', 'retry', 'suppressed', 'skipped'))
  );

create table if not exists attendance_notice_audit (
  id text primary key,
  outbox_id text not null,
  from_status text not null,
  to_status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists attendance_notice_audit_outbox_idx
  on attendance_notice_audit (outbox_id, created_at);
