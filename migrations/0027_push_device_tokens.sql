-- Device tokens for later vacancy / alert push (FCM + APNs).
-- FEATURE_PUSH defaults off. Register is auth-required. No blast sender.
-- Do not treat a row here as consent to send until the flag and credentials
-- are set and a live sender is wired (see docs/push.md).

create table if not exists push_device_tokens (
  id text primary key,
  user_id text not null,
  token text not null,
  platform text not null,
  provider text not null default 'fcm',
  device_id text,
  locale text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'push_device_tokens_platform_chk'
  ) then
    alter table push_device_tokens
      add constraint push_device_tokens_platform_chk
      check (platform in ('ios', 'android'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'push_device_tokens_provider_chk'
  ) then
    alter table push_device_tokens
      add constraint push_device_tokens_provider_chk
      check (provider in ('fcm', 'apns'));
  end if;
end $$;

create unique index if not exists push_device_tokens_token_uidx
  on push_device_tokens (token);

create index if not exists push_device_tokens_user_idx
  on push_device_tokens (user_id, last_seen_at desc);
