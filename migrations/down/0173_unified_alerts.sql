-- Reverse of migrations/0173_unified_alerts.sql.
-- Drops only the unified alert tables and the columns that migration added.
-- Does not drop existing notification tables.
-- The migrator does not run files in this folder.

drop table if exists unified_alert_events;
drop table if exists unified_alert_prefs;
drop table if exists unified_alert_settings;
alter table family_documents drop column if exists expires_on;
alter table children drop column if exists allergy_plan_expires_on;
drop index if exists staff_shifts_user_idx;
alter table staff_shifts drop column if exists staff_user_id;
