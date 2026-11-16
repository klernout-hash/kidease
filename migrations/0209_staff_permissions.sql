-- Per-staff permissions on the Employees desk.
-- Existing staff stay on the Staff preset (today's access).
-- Existing managers stay on the Manager preset.
-- To undo: see migrations/down/0209_staff_permissions.sql

alter table centre_members add column if not exists permission_preset text;
alter table centre_members add column if not exists permissions jsonb;

alter table centre_invites add column if not exists permission_preset text;

update centre_members
set permission_preset = 'staff'
where role = 'staff'
  and permission_preset is null
  and status = 'active';

update centre_members
set permission_preset = 'manager'
where role = 'manager'
  and permission_preset is null
  and status = 'active';
