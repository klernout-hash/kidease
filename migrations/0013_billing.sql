-- KidEase billing: parent invoices, daycare monthly payouts, Stripe Connect hooks.
-- Amounts are CAD dollars (integer), matching bookings.monthly_amount / payments.amount.

alter table payments
  add column if not exists invoice_id text,
  add column if not exists period text,
  add column if not exists platform_fee int not null default 0,
  add column if not exists net_amount int not null default 0,
  add column if not exists stripe_payment_intent text,
  add column if not exists stripe_charge_id text,
  add column if not exists payout_id text;

create table if not exists invoices (
  id text primary key,
  number text unique not null,
  booking_id text references bookings(id) on delete set null,
  parent_user_id text not null,
  daycare_id text not null references daycares(id),
  period text not null,
  status text not null default 'draft',
  currency text not null default 'cad',
  subtotal int not null default 0,
  platform_fee int not null default 0,
  total int not null default 0,
  due_at date,
  paid_at timestamptz,
  issued_by text not null default 'kidease',
  memo text,
  created_at timestamptz not null default now(),
  unique (booking_id, period)
);

create index if not exists invoices_parent_idx on invoices (parent_user_id, created_at desc);
create index if not exists invoices_daycare_idx on invoices (daycare_id, period);
create index if not exists invoices_status_idx on invoices (status);

create table if not exists invoice_items (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  description text not null,
  quantity int not null default 1,
  amount int not null,
  sort_order int not null default 0
);

create table if not exists payouts (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  period text not null,
  status text not null default 'pending',
  currency text not null default 'cad',
  gross int not null default 0,
  platform_fee int not null default 0,
  net int not null default 0,
  invoice_count int not null default 0,
  stripe_transfer_id text,
  stripe_payout_id text,
  scheduled_for date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (daycare_id, period)
);

create index if not exists payouts_daycare_idx on payouts (daycare_id, period desc);

create table if not exists stripe_accounts (
  daycare_id text primary key references daycares(id) on delete cascade,
  stripe_account_id text,
  charges_enabled int not null default 0,
  payouts_enabled int not null default 0,
  details_submitted int not null default 0,
  default_methods text not null default 'card,apple_pay,google_pay,link,acss_debit,interac',
  updated_at timestamptz not null default now()
);
