-- Parent waitlist tracker. Last status change time only.
-- Does not add a listing, a fee, or another parent's details.

alter table bookings add column if not exists status_updated_at timestamptz;

update bookings
set status_updated_at = created_at
where status_updated_at is null;

create table if not exists waitlist_status_mail (
  id text primary key,
  user_id text not null,
  booking_id text not null,
  status text not null,
  daycare_name text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists waitlist_status_mail_unsent_idx
  on waitlist_status_mail (created_at)
  where sent_at is null;
