-- Extra tax an employee asks to have taken off each cheque.
-- The owner approves it. Until then it is not used.
-- CRA TD1 additional tax, or Revenu Québec TP-1015.3-V.

alter table payroll_employees add column if not exists extra_tax_cents int not null default 0;
alter table payroll_employees add column if not exists extra_tax_authority text not null default 'cra';

create table if not exists payroll_extra_tax_requests (
  id text primary key,
  daycare_id text not null,
  employee_id text not null,
  user_id text not null,
  amount_cents int not null,
  authority text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);

create index if not exists payroll_extra_tax_employee_idx
  on payroll_extra_tax_requests (employee_id, created_at desc);
