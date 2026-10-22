-- Passkeys (WebAuthn). Credential id is the base64url credential id.
-- public_key is base64url COSE. counter blocks cloned authenticators.
-- Challenges are single-use and also the rate-limit log.

create table if not exists passkey_credentials (
  id text primary key,
  user_id text not null,
  public_key text not null,
  counter bigint not null default 0,
  transports text not null default '',
  device_name text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists passkey_credentials_user_idx
  on passkey_credentials (user_id, created_at desc);

create table if not exists passkey_challenges (
  id text primary key,
  user_id text,
  ip text,
  kind text not null,
  challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists passkey_challenges_ip_idx
  on passkey_challenges (ip, created_at desc);

create index if not exists passkey_challenges_user_idx
  on passkey_challenges (user_id, created_at desc);
