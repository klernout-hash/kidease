-- CASL (Canada's Anti-Spam Legislation) consent records.
-- Express opt-in for parent/provider SMS and commercial/alert email.
-- FEATURE_SMS stays off in this change — this only makes turning it on safe.
-- Do not treat a phone or email on profiles as consent.

create table if not exists casl_consents (
  user_id text not null,
  channel text not null,
  purpose text not null,
  granted int not null default 0,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  method text,
  statement text,
  address text,
  locale text,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel, purpose)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'casl_consents_channel_chk'
  ) then
    alter table casl_consents
      add constraint casl_consents_channel_chk
      check (channel in ('sms', 'email'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'casl_consents_purpose_chk'
  ) then
    alter table casl_consents
      add constraint casl_consents_purpose_chk
      check (purpose in ('service', 'commercial'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'casl_consents_granted_chk'
  ) then
    alter table casl_consents
      add constraint casl_consents_granted_chk
      check (granted in (0, 1));
  end if;
end $$;

create index if not exists casl_consents_address_idx
  on casl_consents (channel, address)
  where address is not null;

create table if not exists casl_consent_events (
  id text primary key,
  user_id text,
  channel text not null,
  purpose text not null,
  action text not null,
  method text not null,
  statement text,
  address text,
  locale text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'casl_consent_events_channel_chk'
  ) then
    alter table casl_consent_events
      add constraint casl_consent_events_channel_chk
      check (channel in ('sms', 'email'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'casl_consent_events_purpose_chk'
  ) then
    alter table casl_consent_events
      add constraint casl_consent_events_purpose_chk
      check (purpose in ('service', 'commercial'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'casl_consent_events_action_chk'
  ) then
    alter table casl_consent_events
      add constraint casl_consent_events_action_chk
      check (action in ('grant', 'withdraw'));
  end if;
end $$;

create index if not exists casl_consent_events_user_idx
  on casl_consent_events (user_id, created_at desc);

create index if not exists casl_consent_events_address_idx
  on casl_consent_events (channel, address, created_at desc);

-- Phone/email block list (STOP / ARRÊT / one-click unsubscribe).
-- Blocks a destination even when a later account still has a stale grant.
create table if not exists casl_address_blocks (
  channel text not null,
  address text not null,
  purpose text not null,
  blocked_at timestamptz not null default now(),
  method text not null,
  primary key (channel, address, purpose)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'casl_address_blocks_channel_chk'
  ) then
    alter table casl_address_blocks
      add constraint casl_address_blocks_channel_chk
      check (channel in ('sms', 'email'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'casl_address_blocks_purpose_chk'
  ) then
    alter table casl_address_blocks
      add constraint casl_address_blocks_purpose_chk
      check (purpose in ('service', 'commercial', 'all'));
  end if;
end $$;
