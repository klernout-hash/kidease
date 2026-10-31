-- Government desk. Aggregated reads only. No parent, child, or centre contact columns.

alter table profiles drop constraint if exists profiles_role_chk;

do $$
begin
  if not exists (
    select 1 from profiles
    where role is not null
      and role not in ('parent', 'provider', 'admin', 'support', 'support_lead', 'government')
  ) then
    alter table profiles
      add constraint profiles_role_chk
      check (role in ('parent', 'provider', 'admin', 'support', 'support_lead', 'government'));
  end if;
end $$;

create table if not exists government_orgs (
  id text primary key,
  name text not null,
  province text not null,
  demo int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists government_members (
  user_id text primary key,
  org_id text not null references government_orgs(id),
  status text not null default 'active',
  read_only int not null default 1,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (status in ('active', 'revoked'))
);

create table if not exists government_api_keys (
  id text primary key,
  user_id text not null,
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists government_api_keys_user_idx
  on government_api_keys (user_id)
  where revoked_at is null;

create table if not exists government_audit (
  id text primary key,
  user_id text,
  action text not null,
  province text,
  created_at timestamptz not null default now()
);

create index if not exists government_audit_user_idx
  on government_audit (user_id, action, created_at desc);

create table if not exists government_invites (
  id text primary key,
  email text not null,
  org_name text not null,
  province text not null,
  token_hash text not null unique,
  invited_by text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
