-- Per-category alert opt-out, quiet-hours queue, and web push subscriptions.
-- FEATURE_PUSH stays off. Billing rows are ignored while SUBSCRIPTIONS_ENABLED is off.
-- Missing preference row means the category is on.

create table if not exists notification_prefs (
  user_id text not null,
  category text not null,
  enabled int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create table if not exists notification_outbox (
  id text primary key,
  user_id text not null,
  category text not null,
  locale text not null default 'en',
  title text not null,
  body text not null,
  href text not null,
  dedupe_key text not null,
  critical int not null default 0,
  email_fallback int not null default 0,
  send_after timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notification_outbox_user_dedupe
  on notification_outbox (user_id, dedupe_key);

create index if not exists notification_outbox_due_idx
  on notification_outbox (send_after)
  where sent_at is null;

create table if not exists web_push_subscriptions (
  id text primary key,
  user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  locale text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists web_push_subscriptions_endpoint_uidx
  on web_push_subscriptions (endpoint);

create index if not exists web_push_subscriptions_user_idx
  on web_push_subscriptions (user_id, last_seen_at desc);
