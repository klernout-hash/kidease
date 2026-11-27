-- Explicit assignment only. Never infer or backfill a centre for older data requests.
alter table dsr_tasks add column if not exists daycare_id text;
alter table dsr_tasks add column if not exists assigned_by text;
alter table dsr_tasks add column if not exists assigned_at timestamptz;
create index if not exists dsr_tasks_assigned_open_idx
  on dsr_tasks (daycare_id, request_id)
  where role = 'provider' and status = 'open' and assigned_by is not null;
