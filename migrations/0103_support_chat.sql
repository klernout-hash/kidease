-- Live help chat. Kyle replies by text; the widget polls these rows.

create table if not exists support_chat_threads (
  id text primary key,
  code text not null unique,
  session_token text not null unique,
  status text not null default 'open',
  visitor_name text,
  visitor_user_id text,
  page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_chat_messages (
  id text primary key,
  thread_id text not null references support_chat_threads (id),
  sender text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_chat_messages_thread_idx
  on support_chat_messages (thread_id, created_at);
