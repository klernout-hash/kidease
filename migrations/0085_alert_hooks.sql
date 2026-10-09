-- Saved-listing, still-looking, review replies, and document expiry.
-- Drops the old notification kind check so customer_alert rows can land in the bell.

alter table daycares add column if not exists first_aid_expiry date;

alter table reviews add column if not exists owner_reply text;
alter table reviews add column if not exists owner_reply_at timestamptz;

create table if not exists parent_search_checkins (
  user_id text primary key,
  looking int not null default 1,
  confirmed_at timestamptz,
  nudged_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table user_notifications drop constraint if exists user_notifications_kind_chk;
