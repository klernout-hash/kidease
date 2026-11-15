-- Private daycare files for the document checklist.
-- Storage refs point at R2. Nothing here is a public media URL.
-- Undo: migrations/down/0205_centre_documents.sql

create table if not exists centre_documents (
  id text primary key,
  daycare_id text not null,
  kind text not null,
  policy_key text,
  filename text,
  mime text,
  storage_ref text,
  expires_on date,
  review_status text not null default 'pending',
  review_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists centre_documents_daycare_idx
  on centre_documents (daycare_id, kind);
