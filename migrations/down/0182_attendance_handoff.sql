drop table if exists attendance_notice_outbox;
drop table if exists child_notice_people;
drop index if exists child_check_events_one_correction;
drop index if exists child_check_events_day_action;
drop index if exists child_check_events_idem;
alter table child_check_events drop column if exists reason;
alter table child_check_events drop column if exists correction_of;
alter table child_check_events drop column if exists local_day;
alter table child_check_events drop column if exists idempotency_key;
