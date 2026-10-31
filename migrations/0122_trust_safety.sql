-- 24 hour clock on safety reports, and private owner identity reviews.
-- Identity files stay off public pages. Stripe Identity is not required.

alter table safety_reports add column if not exists due_at timestamptz;
update safety_reports set due_at = created_at + interval '24 hours' where due_at is null;
alter table safety_reports alter column due_at set default (now() + interval '24 hours');

create table if not exists owner_identity_reviews (
  id text primary key,
  user_id text not null,
  daycare_id text not null,
  doc_kind text not null check (doc_kind in ('government_id', 'business_registration')),
  status text not null default 'submitted' check (status in ('submitted', 'needs_changes', 'approved', 'rejected')),
  filename text not null,
  mime text not null,
  byte_size int not null,
  storage_key text,
  reviewer_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists owner_identity_reviews_queue_idx
  on owner_identity_reviews (status, created_at desc);
