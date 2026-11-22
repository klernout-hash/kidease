-- Employee forms for pay day. Versioned. Bank numbers are ciphertext only.
-- Hidden until FEATURE_PROVIDER_PAYROLL is on.

create table if not exists payroll_employee_forms (
  id text primary key,
  daycare_id text not null,
  employee_id text not null,
  user_id text not null,
  kind text not null,
  version int not null,
  status text not null default 'pending',
  answers_json text not null default '{}',
  bank_cipher text,
  bank_last4 text,
  saved_on date not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payroll_employee_forms_person_idx
  on payroll_employee_forms (daycare_id, employee_id, kind, version desc);
