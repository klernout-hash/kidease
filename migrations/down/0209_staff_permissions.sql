-- Reverse of migrations/0209_staff_permissions.sql.
-- Drops the permission columns. centre_members.role stays.

alter table centre_members drop column if exists permissions;
alter table centre_members drop column if exists permission_preset;
alter table centre_invites drop column if exists permission_preset;
