-- Reverse of migrations/0233_media_sessions.sql.
drop index if exists media_sessions_open_idx;
drop table if exists media_sessions;
