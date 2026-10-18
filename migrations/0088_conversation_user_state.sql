-- Per-user inbox state. Star, archive, and "mark as unread" belong to the
-- signed-in person, not the shared thread. Another participant is unchanged.

create table if not exists conversation_user_state (
  conversation_id text not null references conversations(id) on delete cascade,
  user_id text not null,
  starred boolean not null default false,
  archived_at timestamptz,
  marked_unread boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_user_state_user_idx
  on conversation_user_state (user_id, archived_at);
