-- Child portfolio answers and co-parent custody records.
-- Adds columns and tables only. Does not update or delete existing rows.
-- Reverse: migrations/down/0172_child_portfolio_coparent.sql

alter table children add column if not exists immunization_status text;
alter table children add column if not exists immunization_note text;
alter table children add column if not exists home_address text;

comment on column children.immunization_status is
  'record, exempt, or note. Empty means the parent has not answered. Not a clinic feed.';

alter table coparent_links add column if not exists invite_email text;
alter table coparent_links add column if not exists expires_at timestamptz;

create table if not exists coparent_verifications (
  id text primary key,
  link_id text not null,
  daycare_id text not null,
  status text not null default 'pending',
  actor_user_id text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  check (status in ('pending', 'verified', 'rejected'))
);

create unique index if not exists coparent_verifications_centre_idx
  on coparent_verifications (link_id, daycare_id);

create table if not exists custody_restrictions (
  id text primary key,
  daycare_id text not null,
  child_id text not null,
  guardian_user_id text not null,
  mode text not null,
  note text not null default '',
  document_ref text,
  document_name text,
  document_mime text,
  created_by text not null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by text,
  check (mode in ('restrict', 'block'))
);

create index if not exists custody_restrictions_centre_idx
  on custody_restrictions (daycare_id, child_id, lifted_at);

create table if not exists coparent_audit (
  id text primary key,
  link_id text,
  daycare_id text,
  child_id text,
  actor_user_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  check (action in (
    'invite', 'accept', 'revoke', 'verify', 'restriction', 'restriction_lift', 'pickup_change'
  ))
);

create index if not exists coparent_audit_link_idx
  on coparent_audit (link_id, created_at desc);

create index if not exists coparent_audit_centre_idx
  on coparent_audit (daycare_id, created_at desc);
