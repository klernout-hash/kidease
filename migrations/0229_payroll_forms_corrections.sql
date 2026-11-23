-- Approved tax forms feed pay, bank reveals are logged, and corrections to
-- approved periods carry into the next pay. Additive only. Not applied by this PR.

-- missing (no approved form yet), basic (basic personal amount), claim (the
-- total claim in td1_*_cents), zero (claims $0, e.g. another job claims it).
alter table payroll_employees add column if not exists td1_federal_state text not null default 'missing';
alter table payroll_employees add column if not exists td1_provincial_state text not null default 'missing';

-- Every time the owner opens a full bank number.
create table if not exists payroll_bank_reveals (
  id text primary key,
  daycare_id text not null,
  employee_id text not null,
  form_id text not null,
  actor_id text not null,
  created_at timestamptz not null default now()
);

-- What each approved period paid for each day, so a later change can be priced.
create table if not exists payroll_paid_days (
  period_id text not null,
  daycare_id text not null,
  employee_id text not null,
  work_date date not null,
  minutes int not null,
  rate_cents int not null,
  primary key (period_id, employee_id, work_date)
);

create index if not exists payroll_paid_days_person_idx
  on payroll_paid_days (daycare_id, employee_id, work_date);

-- A correction paid in a later pay: the minutes it added or took away for one day.
create table if not exists payroll_correction_lines (
  id text primary key,
  period_id text not null,
  for_period_id text not null,
  daycare_id text not null,
  employee_id text not null,
  work_date date not null,
  delta_minutes int not null,
  rate_cents int not null,
  cents int not null,
  created_at timestamptz not null default now()
);

create index if not exists payroll_correction_lines_person_idx
  on payroll_correction_lines (daycare_id, employee_id, work_date);
