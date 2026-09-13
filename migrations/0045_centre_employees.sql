-- Daycare desk employees: Better Auth users bound to a centre via membership.
-- Owner rows stay on provider_daycares (existing primary). Staff are not
-- inserted there — money / contracts / billing / licence claim stay owner-only.
-- Idempotent for PGLite + Neon.

create table if not exists centre_members (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('owner', 'manager', 'staff', 'read_only')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_by text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text
);

create unique index if not exists centre_members_centre_user_uidx
  on centre_members (daycare_id, user_id);

create index if not exists centre_members_user_idx
  on centre_members (user_id, status);

create index if not exists centre_members_centre_idx
  on centre_members (daycare_id, status);

create table if not exists centre_invites (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  email text not null,
  name text,
  role text not null check (role in ('manager', 'staff', 'read_only')),
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id text
);

create unique index if not exists centre_invites_token_uidx
  on centre_invites (token_hash);

create index if not exists centre_invites_centre_email_idx
  on centre_invites (daycare_id, email, status);

create index if not exists centre_invites_actor_idx
  on centre_invites (invited_by, created_at desc);

-- Existing directors appear on the employee list as Owner.
insert into centre_members (id, daycare_id, user_id, role, status, created_at)
select
  'cm_' || substr(md5(p.user_id || p.daycare_id), 1, 16),
  p.daycare_id,
  p.user_id,
  'owner',
  'active',
  now()
from provider_daycares p
where not exists (
  select 1 from centre_members m
  where m.user_id = p.user_id and m.daycare_id = p.daycare_id
);
