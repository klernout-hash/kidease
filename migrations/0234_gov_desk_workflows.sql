-- Government desk workflows (KB-24 gov desk build). Additive only.
-- Apply by hand (Neon SQL), never via npm run db:migrate. Undo: migrations/down/0234_gov_desk_workflows.sql
--
-- 1. Change requests round trip: a province can return a request with a note,
--    and the centre can resubmit. Status stays pending|approved|declined
--    (existing check). A return is status = 'pending' with returned_at set.
-- 2. Change request history (who did what, when). No child data.
-- 3. Notices to centres: drafts, picked centres, and send time.
-- 4. Serious occurrences: the province can mark a report as reviewed.

alter table listing_change_requests add column if not exists review_note text;
alter table listing_change_requests add column if not exists returned_at timestamptz;
alter table listing_change_requests add column if not exists resubmitted_at timestamptz;

create table if not exists listing_change_request_events (
  id text primary key,
  request_id text not null,
  actor_id text,
  actor_role text not null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists listing_change_request_events_request_idx
  on listing_change_request_events (request_id, created_at);

alter table gov_broadcasts add column if not exists status text not null default 'sent';
alter table gov_broadcasts add column if not exists title text;
alter table gov_broadcasts add column if not exists target_centre_ids jsonb;
alter table gov_broadcasts add column if not exists updated_at timestamptz;
alter table gov_broadcasts add column if not exists sent_at timestamptz;
alter table gov_broadcasts add column if not exists sent_by text;

alter table serious_incidents add column if not exists gov_reviewed_at timestamptz;
alter table serious_incidents add column if not exists gov_reviewed_by text;
