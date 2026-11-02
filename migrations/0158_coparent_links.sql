-- Co-parent link. In-app invite only. No email and no SMS.
-- Hidden until FEATURE_COPARENT_LINK is on.
-- The second parent has their own login. Records stay on the main parent.

create table if not exists coparent_links (
  id text primary key,
  owner_user_id text not null,
  member_user_id text,
  access text not null default 'view',
  status text not null default 'pending',
  invite_token text not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  check (access in ('full', 'view')),
  check (status in ('pending', 'active', 'removed'))
);

create unique index if not exists coparent_links_token_idx on coparent_links (invite_token);

create unique index if not exists coparent_links_one_open_owner
  on coparent_links (owner_user_id)
  where status in ('pending', 'active');

create unique index if not exists coparent_links_one_active_member
  on coparent_links (member_user_id)
  where status = 'active' and member_user_id is not null;

create index if not exists coparent_links_member_idx on coparent_links (member_user_id, status);
