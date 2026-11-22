-- Centre pay day, hours, and the government-money ledger.
-- Hidden until FEATURE_PROVIDER_PAYROLL is on.
-- Bank columns store a partner token only. No raw account number.
-- Holding rows are a tax-account reference. KidEase does not move the money.

create table if not exists payroll_employees (
  id text primary key,
  daycare_id text not null,
  user_id text,
  display_name text not null,
  province text not null,
  pay_type text not null,
  rate_cents int not null,
  pay_frequency text not null,
  td1_federal_cents int not null,
  td1_provincial_cents int not null,
  vacation_bps int not null default 400,
  vacation_mode text not null default 'payout',
  cpp_exempt boolean not null default false,
  ei_exempt boolean not null default false,
  bank_token text,
  bank_last4 text,
  pin_salt text,
  pin_hash text,
  created_at timestamptz not null default now()
);

create index if not exists payroll_employees_centre_idx
  on payroll_employees (daycare_id, display_name);

create table if not exists payroll_punches (
  id text primary key,
  daycare_id text not null,
  employee_id text not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  unpaid_break_minutes int not null default 0,
  source text not null,
  approval_status text not null default 'pending',
  manual_reason text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists payroll_punches_centre_idx
  on payroll_punches (daycare_id, clock_in_at desc);

create table if not exists payroll_punch_audits (
  id text primary key,
  punch_id text not null,
  daycare_id text not null,
  actor_id text not null,
  action text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists payroll_journal (
  id text primary key,
  daycare_id text not null,
  ledger text not null,
  memo text not null,
  lines_json text not null,
  created_at timestamptz not null default now()
);

create table if not exists payroll_trust_accounts (
  daycare_id text primary key,
  adapter_id text not null default 'sandbox',
  holder text not null,
  account_ref text not null,
  created_at timestamptz not null default now()
);

create table if not exists payroll_notice_log (
  dedupe_key text primary key,
  daycare_id text not null,
  user_id text not null,
  slot text not null,
  created_at timestamptz not null default now()
);
