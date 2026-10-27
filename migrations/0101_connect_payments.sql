-- Parent pay choice per centre, and the monthly tax invoice on KidEase fees.
-- Amounts are cents. No bank account numbers.

create table if not exists parent_pay_prefs (
  parent_user_id text not null,
  daycare_id text not null references daycares(id) on delete cascade,
  mode text not null default 'manual',
  updated_at timestamptz not null default now(),
  primary key (parent_user_id, daycare_id),
  constraint parent_pay_prefs_mode_chk check (mode in ('automatic', 'manual'))
);

alter table invoices
  add column if not exists stripe_invoice_id text;

create index if not exists invoices_stripe_invoice_idx on invoices (stripe_invoice_id);

create table if not exists daycare_fee_invoices (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  period text not null,
  fee_cents int not null default 0,
  tax_cents int,
  stripe_invoice_id text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (daycare_id, period)
);

-- One row per paid parent bill, so a month can collect tax from every bill.
create table if not exists daycare_fee_invoice_lines (
  bill_id text primary key references invoices(id) on delete cascade,
  daycare_id text not null references daycares(id) on delete cascade,
  period text not null,
  fee_cents int not null,
  tax_cents int not null,
  created_at timestamptz not null default now()
);

create index if not exists daycare_fee_invoice_lines_period_idx
  on daycare_fee_invoice_lines (daycare_id, period);
