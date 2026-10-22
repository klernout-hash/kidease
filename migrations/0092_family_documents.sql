-- Parent document vault. Private immunization records and subsidy forms.
-- A share is the only way a centre can read a file. Revoke sets revoked_at.
-- No public listing column. No payment data.

create table if not exists family_documents (
  id text primary key,
  user_id text not null,
  kind text not null,
  file_name text not null,
  mime text not null,
  byte_size integer not null,
  storage_ref text not null,
  created_at timestamptz not null default now(),
  constraint family_documents_kind_chk check (kind in ('immunization', 'subsidy'))
);

create index if not exists family_documents_user_idx
  on family_documents (user_id, created_at desc);

create table if not exists family_document_shares (
  id text primary key,
  document_id text not null references family_documents (id) on delete cascade,
  daycare_id text not null,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists family_document_shares_open_idx
  on family_document_shares (document_id, daycare_id)
  where revoked_at is null;

create index if not exists family_document_shares_centre_idx
  on family_document_shares (daycare_id, revoked_at);
