-- Track foundation: unified parent → centre lead requests.
-- Types: tour | waitlist | spot_inquiry
-- Status: requested | confirmed | declined | received | answered | closed
-- Reuses existing tour_requests, bookings (spot), and waitlist_interests as sources.
-- Not chat, not CRM sync, not push.

create table if not exists lead_requests (
  id text primary key,
  kind text not null,
  status text not null default 'requested',
  user_id text not null,
  daycare_id text not null references daycares(id),
  message text,
  reply_note text,
  source_kind text,
  source_id text,
  conversation_id text,
  responded_by text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_requests_kind_chk'
  ) then
    alter table lead_requests
      add constraint lead_requests_kind_chk
      check (kind in ('tour', 'waitlist', 'spot_inquiry'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'lead_requests_status_chk'
  ) then
    alter table lead_requests
      add constraint lead_requests_status_chk
      check (status in ('requested', 'confirmed', 'declined', 'received', 'answered', 'closed'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'lead_requests_source_kind_chk'
  ) then
    alter table lead_requests
      add constraint lead_requests_source_kind_chk
      check (source_kind is null or source_kind in ('tour_request', 'booking', 'waitlist_interest'));
  end if;
end $$;

create unique index if not exists lead_requests_source_uidx
  on lead_requests (source_kind, source_id)
  where source_kind is not null and source_id is not null;

create index if not exists lead_requests_user_idx
  on lead_requests (user_id, created_at desc);

create index if not exists lead_requests_daycare_status_idx
  on lead_requests (daycare_id, status, created_at desc);

-- Backfill tours.
insert into lead_requests (
  id, kind, status, user_id, daycare_id, message, reply_note,
  source_kind, source_id, conversation_id, responded_by, responded_at, created_at, updated_at
)
select
  'lr_' || t.id,
  'tour',
  case t.status
    when 'accepted' then 'confirmed'
    when 'declined' then 'declined'
    when 'lost' then 'declined'
    when 'completed' then 'closed'
    when 'enrolled' then 'closed'
    else 'requested'
  end,
  t.user_id,
  t.daycare_id,
  t.parent_note,
  t.centre_note,
  'tour_request',
  t.id,
  t.conversation_id,
  t.responded_by,
  t.responded_at,
  t.created_at,
  coalesce(t.responded_at, t.created_at)
from tour_requests t
where not exists (
  select 1 from lead_requests l
  where l.source_kind = 'tour_request' and l.source_id = t.id
);

-- Backfill spot inquiries (bookings).
insert into lead_requests (
  id, kind, status, user_id, daycare_id, message,
  source_kind, source_id, conversation_id, created_at, updated_at
)
select
  'lr_' || b.id,
  'spot_inquiry',
  case b.status
    when 'under_review' then 'received'
    when 'waitlist' then 'received'
    when 'accepted' then 'confirmed'
    when 'declined' then 'declined'
    when 'active' then 'closed'
    when 'cancelled' then 'closed'
    else 'requested'
  end,
  b.user_id,
  b.daycare_id,
  b.parent_note,
  'booking',
  b.id,
  b.conversation_id,
  b.created_at,
  b.created_at
from bookings b
where not exists (
  select 1 from lead_requests l
  where l.source_kind = 'booking' and l.source_id = b.id
);

-- Backfill waitlist pulse opt-ins as waitlist leads.
insert into lead_requests (
  id, kind, status, user_id, daycare_id, message,
  source_kind, source_id, created_at, updated_at
)
select
  'lr_' || w.id,
  'waitlist',
  'requested',
  w.user_id,
  w.daycare_id,
  'Waitlist pulse opt-in',
  'waitlist_interest',
  w.id,
  w.created_at,
  w.updated_at
from waitlist_interests w
where not exists (
  select 1 from lead_requests l
  where l.source_kind = 'waitlist_interest' and l.source_id = w.id
);
