-- One-time codes that move a Google or Facebook sign-in from the system
-- auth sheet back into the Capacitor webview. Rows expire in two minutes
-- and are deleted when used. This does not store a child's name.

create table if not exists native_auth_handoff (
  code text primary key,
  session_token text not null,
  next_path text not null,
  expires_at timestamptz not null
);

create index if not exists native_auth_handoff_expires_idx on native_auth_handoff (expires_at);
