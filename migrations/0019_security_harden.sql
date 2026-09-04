-- KidEase security harden: role constraint, last-admin trigger,
-- insert-only security_events, Better Auth rateLimit + twoFactor tables.
-- Idempotent so preview PGLite and Neon can re-run safely.

update profiles
set role = 'parent'
where role is null or role not in ('parent', 'provider', 'admin');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_chk'
  ) then
    alter table profiles
      add constraint profiles_role_chk
      check (role in ('parent', 'provider', 'admin'));
  end if;
end $$;

create or replace function prevent_last_admin_loss()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin'
       and (select count(*) from profiles where role = 'admin' and user_id <> old.user_id) = 0 then
      raise exception 'refusing to delete the last admin';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'admin'
       and new.role is distinct from 'admin'
       and (select count(*) from profiles where role = 'admin' and user_id <> old.user_id) = 0 then
      raise exception 'refusing to demote the last admin';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_last_admin on profiles;
create trigger profiles_last_admin
  before update or delete on profiles
  for each row
  execute procedure prevent_last_admin_loss();

create table if not exists security_events (
  id text primary key,
  at timestamptz not null default now(),
  kind text not null,
  actor_user_id text,
  target_user_id text,
  daycare_id text,
  ip text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists security_events_at_idx on security_events (at desc);
create index if not exists security_events_actor_idx on security_events (actor_user_id, at desc);
create index if not exists security_events_kind_idx on security_events (kind, at desc);

create or replace function security_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'security_events is insert-only';
end;
$$;

drop trigger if exists security_events_no_update on security_events;
create trigger security_events_no_update
  before update or delete on security_events
  for each row
  execute procedure security_events_immutable();

-- Better Auth rate-limit storage (serverless-safe).
create table if not exists "rateLimit" (
  "id" text primary key,
  "key" text not null,
  "count" integer not null,
  "lastRequest" bigint not null
);
create index if not exists rateLimit_key_idx on "rateLimit" ("key");

-- Better Auth twoFactor plugin.
alter table "user" add column if not exists "twoFactorEnabled" boolean not null default false;

create table if not exists "twoFactor" (
  "id" text primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "user" ("id") on delete cascade
);
create unique index if not exists twoFactor_userId_idx on "twoFactor" ("userId");

-- Trusted-device record for admin step-up (new IP / new device forces 2FA).
create table if not exists admin_trusted_devices (
  id text primary key,
  user_id text not null,
  device_hash text not null,
  ip text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists admin_trusted_devices_uniq
  on admin_trusted_devices (user_id, device_hash);
