-- Live support chat on the existing support thread.
-- One thread per person stays. Adds a send key, a read mark, and an alert clock.
-- To undo: see migrations/down/0208_live_support.sql

alter table support_messages add column if not exists idempotency_key text;

create unique index if not exists support_messages_idem_idx
  on support_messages (thread_id, idempotency_key);

alter table support_threads add column if not exists reference_code text;
alter table support_threads add column if not exists last_alert_at timestamptz;

create table if not exists support_reads (
  thread_id text not null references support_threads(id) on delete cascade,
  user_id text not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
