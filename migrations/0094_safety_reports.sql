-- User reports (listing, centre, or message thread) and message blocks.
-- Apple 1.2 and Google user-generated content: flag, block, and a review queue.

create table if not exists safety_reports (
  id text primary key,
  target_kind text not null,
  daycare_id text,
  conversation_id text,
  reported_user_id text,
  reporter_user_id text,
  reporter_name text,
  reporter_email text,
  reason text not null,
  detail text,
  status text not null default 'open',
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);

create index if not exists safety_reports_status_idx
  on safety_reports (status, created_at desc);

create table if not exists safety_blocks (
  id text primary key,
  blocker_user_id text not null,
  blocked_user_id text,
  daycare_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists safety_blocks_user_pair_idx
  on safety_blocks (blocker_user_id, blocked_user_id)
  where blocked_user_id is not null;

create unique index if not exists safety_blocks_daycare_idx
  on safety_blocks (blocker_user_id, daycare_id)
  where daycare_id is not null and blocked_user_id is null;
