-- Year-end slip files (T4, T4A, RL-1). Hidden until FEATURE_PAYROLL_SLIP_XML is on.
-- Additive only. Not applied by this PR. KidEase does not file slips.

-- Employer details printed on the slips and summaries. Empty until the owner enters them.
create table if not exists payroll_slip_settings (
  daycare_id text primary key,
  employer_name text not null default '',
  business_number text not null default '',
  addr_line text not null default '',
  city text not null default '',
  prov_cd text not null default '',
  postal_cd text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  -- CRA T4 box 45, employer-offered dental benefits: 1 to 5.
  dental_code text not null default '',
  -- Revenu Québec: identification number, transmitter (NP) number, software certification number.
  rq_id text not null default '',
  rq_np text not null default '',
  rq_cert text not null default '',
  updated_by text not null,
  updated_at timestamptz not null default now()
);

-- Every slip file download: who, when, which year, which slips.
create table if not exists payroll_slip_exports (
  id text primary key,
  daycare_id text not null,
  actor_id text not null,
  tax_year int not null,
  kinds text not null,
  people int not null default 0,
  created_at timestamptz not null default now()
);
