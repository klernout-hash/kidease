-- Audit row for a provincial licensing export. The file itself is not stored.
-- FEATURE_PROVINCE_REPORTS stays off until Kyle turns it on.

create table if not exists province_report_exports (
  id text primary key,
  province text not null,
  format text not null,
  row_count int not null,
  actor_user_id text,
  created_at timestamptz not null default now()
);
