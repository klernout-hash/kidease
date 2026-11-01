-- Enrolment hand-off. Hidden until FEATURE_ENROLMENT_HANDOFF is on.
-- The first invoice uses a fee already stored on the listing.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists enrolment_handoffs (
  id text primary key,
  offer_id text not null unique,
  daycare_id text not null,
  parent_user_id text not null,
  province text not null,
  age_group text not null,
  step text not null,
  contract_id text,
  envelope_id text,
  invoice_id text,
  fee_cents int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enrolment_handoffs_parent_idx
  on enrolment_handoffs (parent_user_id, updated_at desc);
