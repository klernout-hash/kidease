-- Pay day records: hour and rate changes with a reason, staff flags, payroll editors,
-- approved pay periods with their stubs, contractor invoice drafts, and centre settings.
-- Additive only. Hidden until FEATURE_PROVIDER_PAYROLL is on. Not applied by this PR.

-- One open check-in per person. A second "check in" cannot start a new open shift.
create unique index if not exists payroll_punches_one_open_idx
  on payroll_punches (employee_id) where clock_out_at is null;

alter table payroll_employees add column if not exists worker_type text not null default 'employee';
alter table payroll_employees add column if not exists contractor_basis text;
alter table payroll_employees add column if not exists gst_registered boolean not null default false;
alter table payroll_employees add column if not exists gst_number text;
alter table payroll_employees add column if not exists hire_date date;
alter table payroll_employees add column if not exists end_date date;
alter table payroll_employees add column if not exists td1_status text not null default 'missing';

-- Owner-granted pay permission. Without a row here only the owner can change pay.
create table if not exists payroll_editors (
  daycare_id text not null,
  user_id text not null,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  primary key (daycare_id, user_id)
);

-- Append-only. Each row is one change: who, when, old value, new value, reason.
-- field: day_minutes (work_date set; an empty new_value means reset to check-in times),
-- rate_cents or pay_type (period_start set).
-- supersedes_id is the row the editor saw. A stale edit (someone changed it since) is refused.
create table if not exists payroll_overrides (
  id text primary key,
  daycare_id text not null,
  employee_id text not null,
  field text not null,
  work_date date,
  period_start date,
  old_value text not null default '',
  new_value text not null default '',
  reason text not null,
  actor_id text not null,
  supersedes_id text,
  correction boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists payroll_overrides_person_idx
  on payroll_overrides (daycare_id, employee_id, field, work_date, period_start, created_at desc);

-- Two editors cannot both build on the same earlier row.
create unique index if not exists payroll_overrides_chain_idx
  on payroll_overrides (daycare_id, employee_id, field, coalesce(work_date, period_start), coalesce(supersedes_id, ''));

create table if not exists payroll_day_flags (
  id text primary key,
  daycare_id text not null,
  employee_id text not null,
  work_date date not null,
  note text not null,
  user_id text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists payroll_day_flags_person_idx
  on payroll_day_flags (daycare_id, employee_id, work_date);

create table if not exists payroll_periods (
  id text primary key,
  daycare_id text not null,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status text not null default 'approved',
  approved_by text not null,
  approved_at timestamptz not null default now()
);

create unique index if not exists payroll_periods_centre_idx
  on payroll_periods (daycare_id, period_start, period_end);

create table if not exists payroll_stubs (
  id text primary key,
  period_id text not null,
  daycare_id text not null,
  employee_id text not null,
  pay_date date not null,
  stub_json text not null,
  created_at timestamptz not null default now()
);

create index if not exists payroll_stubs_centre_idx
  on payroll_stubs (daycare_id, pay_date);

-- Contractor invoice drafts only. KidEase does not pay them.
create table if not exists payroll_contractor_drafts (
  id text primary key,
  daycare_id text not null,
  employee_id text not null,
  period_id text,
  fee_cents int not null,
  sales_tax_cents int not null default 0,
  status text not null default 'draft',
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists payroll_centre_settings (
  daycare_id text primary key,
  remitter_type text not null default 'regular',
  wcb_rate_bps int,
  yearly_payroll_cents bigint,
  health_tax_exemption boolean not null default true,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
