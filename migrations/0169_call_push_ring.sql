-- Background call ring (FEATURE_CALL_PUSH, default off).
-- VoIP / high-priority call tokens live beside alert tokens, tagged kind='call'.
-- call_rings tracks one ring so answer / decline / 25 s timeout can cancel it.

alter table push_device_tokens add column if not exists kind text not null default 'alert';

alter table push_device_tokens drop constraint if exists push_device_tokens_platform_chk;
alter table push_device_tokens
  add constraint push_device_tokens_platform_chk check (platform in ('ios', 'android', 'huawei', 'amazon'));

alter table push_device_tokens drop constraint if exists push_device_tokens_provider_chk;
alter table push_device_tokens
  add constraint push_device_tokens_provider_chk check (provider in ('fcm', 'apns', 'apns_voip', 'hms', 'adm'));

create table if not exists call_rings (
  id text primary key,
  conversation_id text not null,
  caller_user_id text not null,
  callee_user_id text not null,
  media text not null default 'voice',
  status text not null default 'ringing',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

create index if not exists call_rings_callee_idx on call_rings (callee_user_id, status, created_at desc);
create index if not exists call_rings_conversation_idx on call_rings (conversation_id, created_at desc);
