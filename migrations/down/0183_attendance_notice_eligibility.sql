drop index if exists attendance_notice_audit_outbox_idx;
drop table if exists attendance_notice_audit;

alter table attendance_notice_outbox drop constraint if exists attendance_notice_status;
alter table attendance_notice_outbox drop constraint if exists attendance_notice_channel;
alter table attendance_notice_outbox drop constraint if exists attendance_notice_unsent;
alter table attendance_notice_outbox drop constraint if exists attendance_notice_demo;

delete from attendance_notice_outbox where channel <> 'demo';

alter table attendance_notice_outbox drop column if exists updated_at;
alter table attendance_notice_outbox drop column if exists last_error;
alter table attendance_notice_outbox drop column if exists attempts;
alter table attendance_notice_outbox drop column if exists audience;
alter table attendance_notice_outbox drop column if exists recipient_user_id;

alter table attendance_notice_outbox add constraint attendance_notice_demo check (channel = 'demo');
alter table attendance_notice_outbox add constraint attendance_notice_unsent check (status in ('held', 'skipped'));
