-- Reverse of migrations/0172_child_portfolio_coparent.sql.
-- Drops only the columns and tables that migration added.
-- Does not delete children, bookings, or coparent_links rows.
-- The migrator does not run files in this folder.

drop table if exists coparent_audit;
drop table if exists custody_restrictions;
drop table if exists coparent_verifications;

alter table coparent_links drop column if exists expires_at;
alter table coparent_links drop column if exists invite_email;

alter table children drop column if exists home_address;
alter table children drop column if exists immunization_note;
alter table children drop column if exists immunization_status;
