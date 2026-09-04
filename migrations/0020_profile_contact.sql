-- Contact fields on the existing profiles row (one per user).
-- phone already exists from 0002_schema.sql.
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists bio text;
