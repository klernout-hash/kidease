-- Reverse of migrations/0208_live_support.sql.
-- Drops the live-chat columns only. Support threads and messages stay.

drop table if exists support_reads;
drop index if exists support_messages_idem_idx;
alter table support_messages drop column if exists idempotency_key;
alter table support_threads drop column if exists reference_code;
alter table support_threads drop column if exists last_alert_at;
