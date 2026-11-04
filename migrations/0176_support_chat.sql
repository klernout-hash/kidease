-- Support threads inside Messages. Reversible. Does not change daycare conversations.
-- To undo: see migrations/down/0176_support_chat.sql

create table if not exists support_threads (
  id text primary key,
  user_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_user_at timestamptz,
  last_admin_at timestamptz,
  last_owner_sms_at timestamptz,
  admin_unread int not null default 0,
  user_unread int not null default 0,
  owner_emailed int not null default 0
);

create table if not exists support_messages (
  id text primary key,
  thread_id text not null references support_threads(id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_idx on support_messages (thread_id, created_at);
create index if not exists support_threads_updated_idx on support_threads (updated_at desc);
