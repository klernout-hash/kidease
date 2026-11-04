-- Reverse of migrations/0171_host_calendar.sql.
-- Drops only the host calendar tables. Does not delete daycares or spots.
-- The migrator does not run files in this folder.

drop table if exists daycare_family_guides;
drop table if exists host_calendar_days;
