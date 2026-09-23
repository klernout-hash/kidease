-- Sliding Admin idle last-seen, keyed to the current Better Auth session.
-- The short-lived idle cookie can be dropped by Safari or never returned on
-- GET server-fn Set-Cookie; this row is the activity source of truth.

create table if not exists admin_idle_seen (
  user_id text not null,
  session_token text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, session_token)
);

create index if not exists admin_idle_seen_seen_at_idx on admin_idle_seen (seen_at);
