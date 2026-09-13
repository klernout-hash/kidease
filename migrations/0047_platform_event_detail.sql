-- Extra actor fields for Admin people / account notify (phone, auth method, role).
-- Name, email, city already live on provider_* / city columns.
alter table platform_events add column if not exists detail text;
