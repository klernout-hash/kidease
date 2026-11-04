-- Reverse of migrations/0176_support_chat.sql.
-- Drops only the support thread tables. Does not delete daycare messages.
-- The migrator does not run files in this folder.

drop table if exists support_messages;
drop table if exists support_threads;
