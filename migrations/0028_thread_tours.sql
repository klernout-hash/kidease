-- PR D: parent ↔ centre coordination threads + structured tour/visit requests.
-- Reuses conversations / messages (already live on /inbox). Messaging is no
-- longer booking-gated. Tours are not enrolment bookings.

create table if not exists tour_requests (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  user_id text not null,
  daycare_id text not null references daycares(id),
  child_id text,
  child_name text,
  preferred_times text not null,
  parent_note text,
  status text not null default 'pending',
  centre_note text,
  responded_by text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tour_requests_status_chk'
  ) then
    alter table tour_requests
      add constraint tour_requests_status_chk
      check (status in ('pending', 'accepted', 'declined'));
  end if;
end $$;

create index if not exists tour_requests_daycare_status_idx
  on tour_requests (daycare_id, status, created_at desc);

create index if not exists tour_requests_user_idx
  on tour_requests (user_id, created_at desc);

create index if not exists tour_requests_conversation_idx
  on tour_requests (conversation_id, created_at desc);

-- Per-participant last-read. Unread badge uses this when present.
create table if not exists conversation_reads (
  conversation_id text not null references conversations(id) on delete cascade,
  user_id text not null,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_reads_user_idx
  on conversation_reads (user_id, last_read_at desc);
