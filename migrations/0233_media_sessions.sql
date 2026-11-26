-- Real call minutes for the daily media cap (video calls + in-app voice). Additive only.
-- One row per video join or placed voice call. The join reserves the admin
-- "minutes per call" estimate; a signed Twilio report (participant-disconnected,
-- room-ended, or the <Dial> action) settles it to the real minutes and moves
-- outbound_daily_usage by the difference. settle_ref makes retries idempotent.
create table if not exists media_sessions (
  id text primary key,
  kind text not null check (kind in ('video', 'voice')),
  twilio_sid text not null,
  identity text,
  conversation_id text,
  user_id text,
  usage_day date not null,
  reserved_minutes integer not null default 0 check (reserved_minutes >= 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes >= 0),
  status text not null default 'open' check (status in ('open', 'settled')),
  settle_ref text unique,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists media_sessions_open_idx
  on media_sessions (kind, twilio_sid, status, created_at);
