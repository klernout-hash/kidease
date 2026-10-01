-- Photos held because a child's face is clearly visible.
-- Stores the preview and the hash. No child name, no parent contact.

create table if not exists photo_checks (
  id text primary key,
  daycare_id text not null,
  sha256 text not null,
  status text not null default 'held',
  preview text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists photo_checks_status_idx
  on photo_checks (status, created_at desc);
