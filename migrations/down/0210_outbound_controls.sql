-- Reverse of migrations/0210_outbound_controls.sql.
-- Removes the outbound switches, counters and their audit rows.

drop table if exists outbound_control_audit;
drop table if exists outbound_daily_usage;
drop table if exists outbound_controls;
