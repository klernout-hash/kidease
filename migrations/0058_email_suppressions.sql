-- Outreach bounce / complaint protection.
-- email_suppressions is the denylist (hard bounce, complaint, manual, unsubscribe).
-- email_events is the log, including soft / temporary bounces that are not suppressed.
-- Addresses are stored lowercased by the app. Idempotent for PGLite + Neon.

create table if not exists email_suppressions (
  email text primary key,
  reason text not null,
  bounce_type text,
  bounce_subtype text,
  resend_email_id text,
  campaign_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_suppressions_reason_chk'
  ) then
    alter table email_suppressions
      add constraint email_suppressions_reason_chk
      check (reason in ('bounce', 'complaint', 'manual', 'unsubscribe'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'email_suppressions_email_lower_chk'
  ) then
    alter table email_suppressions
      add constraint email_suppressions_email_lower_chk
      check (email = lower(email));
  end if;
end $$;

create table if not exists email_events (
  id text primary key,
  email text not null,
  event_type text not null,
  reason text,
  bounce_type text,
  bounce_subtype text,
  resend_email_id text,
  campaign_tag text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_events_reason_chk'
  ) then
    alter table email_events
      add constraint email_events_reason_chk
      check (reason is null or reason in ('bounce', 'complaint', 'manual', 'unsubscribe'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'email_events_email_lower_chk'
  ) then
    alter table email_events
      add constraint email_events_email_lower_chk
      check (email = lower(email));
  end if;
end $$;

create index if not exists email_events_created_idx
  on email_events (created_at desc);

create index if not exists email_events_campaign_created_idx
  on email_events (campaign_tag, created_at desc);

create index if not exists email_events_email_idx
  on email_events (email, created_at desc);
