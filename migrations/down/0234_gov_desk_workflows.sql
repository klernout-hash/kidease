-- Undo 0234_gov_desk_workflows.sql. Drops only what 0234 added.
alter table serious_incidents drop column if exists gov_reviewed_by;
alter table serious_incidents drop column if exists gov_reviewed_at;

alter table gov_broadcasts drop column if exists sent_by;
alter table gov_broadcasts drop column if exists sent_at;
alter table gov_broadcasts drop column if exists updated_at;
alter table gov_broadcasts drop column if exists target_centre_ids;
alter table gov_broadcasts drop column if exists title;
alter table gov_broadcasts drop column if exists status;

drop index if exists listing_change_request_events_request_idx;
drop table if exists listing_change_request_events;

alter table listing_change_requests drop column if exists resubmitted_at;
alter table listing_change_requests drop column if exists returned_at;
alter table listing_change_requests drop column if exists review_note;
