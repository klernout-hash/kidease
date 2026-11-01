-- In-app inbox, read receipts, and channel choices.
-- SMS still needs a CASL opt-in. Push stays behind FEATURE_PUSH.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists role_inbox (
  id text primary key,
  user_id text not null,
  role text not null,
  feature text not null,
  title text not null,
  body text not null,
  href text not null,
  sender_user_id text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by text
);

create index if not exists role_inbox_user_idx on role_inbox (user_id, created_at desc);

create table if not exists notification_channel_prefs (
  user_id text not null,
  channel text not null,
  enabled int not null default 1,
  primary key (user_id, channel),
  check (channel in ('in_app', 'email', 'sms', 'push'))
);
