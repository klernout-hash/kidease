-- Same-day dedupe for site-owned actor mail (provider next-steps).
-- Winnipeg calendar day so signup + first listing do not send twice.
-- Idempotent for PGLite + Neon.

create table if not exists actor_mail_sends (
  purpose text not null,
  email text not null,
  winnipeg_day date not null,
  user_id text,
  created_at timestamptz not null default now(),
  primary key (purpose, email, winnipeg_day)
);

create index if not exists actor_mail_sends_user_day
  on actor_mail_sends (user_id, purpose, winnipeg_day);
