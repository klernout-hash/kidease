drop index if exists dsr_tasks_assigned_open_idx;
alter table dsr_tasks drop column if exists assigned_at;
alter table dsr_tasks drop column if exists assigned_by;
alter table dsr_tasks drop column if exists daycare_id;
