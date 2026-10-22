-- Admin "view as user" sessions. Insert-only audit still lives in security_events.
-- One open row per operator. ended_at closes it (exit, expiry, deny, replace).

create table if not exists view_as_sessions (
  id text primary key,
  admin_user_id text not null,
  target_user_id text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text
);

create index if not exists view_as_sessions_admin_idx
  on view_as_sessions (admin_user_id, started_at desc);
