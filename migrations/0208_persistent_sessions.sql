-- Long-lived parent and daycare sessions. FEATURE_PERSISTENT_SESSIONS defaults off.
-- Refresh secrets are stored as hashes. The raw secret is never written here.

create table if not exists device_sessions (
  id text primary key,
  user_id text not null,
  session_id text,
  session_token text,
  refresh_hash text not null,
  previous_hash text,
  rotated_at timestamptz,
  step_up_hash text,
  push_token text,
  label text,
  platform text,
  user_agent text,
  ip text,
  shell boolean not null default false,
  remember boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text
);

create index if not exists device_sessions_user_idx
  on device_sessions (user_id, revoked_at);

create index if not exists device_sessions_token_idx
  on device_sessions (session_token);
