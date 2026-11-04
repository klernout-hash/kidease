-- Reverse of migrations/0172_host_action_notices.sql.
-- Drops only the host notice table. Does not delete daycare accounts.
-- The migrator does not run files in this folder.

drop table if exists host_action_notices;
