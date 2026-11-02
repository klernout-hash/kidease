-- Parent ↔ centre enrolment agreement.
-- The fee in centre_agreement_terms is not a public listing price.
-- Signed PDFs stay on daycare_contracts and are limited to the parent, the centre,
-- and a linked co-parent when that feature is on.

create table if not exists centre_agreement_terms (
  daycare_id text primary key references daycares(id) on delete cascade,
  terms jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists parent_enrolment_agreements (
  id text primary key,
  contract_id text not null unique references daycare_contracts(id) on delete cascade,
  daycare_id text not null references daycares(id) on delete cascade,
  booking_id text,
  child_id text,
  parent_user_id text not null,
  child_name text not null,
  child_birthdate text not null default '',
  parent_name text not null,
  parent_email text not null,
  director_user_id text,
  director_name text not null,
  director_email text not null,
  status text not null default 'draft',
  start_date text not null default '',
  terms jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'sent', 'parent_signed', 'completed', 'void'))
);

create index if not exists parent_enrolment_agreements_child_idx
  on parent_enrolment_agreements (child_id, updated_at desc);

create index if not exists parent_enrolment_agreements_centre_idx
  on parent_enrolment_agreements (daycare_id, updated_at desc);

create index if not exists parent_enrolment_agreements_parent_idx
  on parent_enrolment_agreements (parent_user_id, updated_at desc);

create index if not exists parent_enrolment_agreements_booking_idx
  on parent_enrolment_agreements (booking_id);
