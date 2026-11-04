-- Reverse of migrations/0173_care_reminders.sql.
-- Drops only the reminder tables. Does not delete children or profiles.
-- The migrator does not run files in this folder.

drop table if exists care_reminder_sends;
drop table if exists care_reminder_days;
drop table if exists care_reminders;
