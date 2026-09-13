-- Trusted devices for Parent / Daycare / Admin (extends #187 remember-device).
-- Session list uses Better Auth "session". This table is the server-side
-- record for `__Host-kidease.2fa.device` so revoke can fail closed.
-- Idempotent for PGLite + Neon.

create table if not exists trusted_devices (
  id text primary key,
  user_id text not null,
  device_id text not null,
  label text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create unique index if not exists trusted_devices_user_device
  on trusted_devices (user_id, device_id);

create index if not exists trusted_devices_user_active_idx
  on trusted_devices (user_id, revoked_at, expires_at);

-- Soft hourly OTP send log. login_challenges rows are deleted after a mint.
create table if not exists two_factor_sends (
  id text primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists two_factor_sends_user_at_idx
  on two_factor_sends (user_id, created_at desc);
