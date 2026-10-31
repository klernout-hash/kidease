-- Stripe parent invoices from invoice.finalized / invoice.paid / invoice.payment_failed.
-- Separate from the KidEase bill ledger (invoices). Amounts are Stripe cents.
-- stripe_webhook_events makes a retry of the same event id a no-op.
-- SMS held for quiet hours is flushed by the hourly alert job.

create table if not exists stripe_parent_invoices (
  stripe_invoice_id text primary key,
  number text not null,
  amount_cents int,
  currency text not null default 'cad',
  status text not null,
  paid_at timestamptz,
  hosted_invoice_url text,
  invoice_pdf text,
  parent_user_id text,
  daycare_id text,
  customer_email text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_parent_invoices_parent_idx
  on stripe_parent_invoices (parent_user_id, created_at desc);

create index if not exists stripe_parent_invoices_daycare_idx
  on stripe_parent_invoices (daycare_id, created_at desc);

create table if not exists stripe_webhook_events (
  id text primary key,
  type text not null,
  livemode boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists stripe_invoice_notices (
  id text primary key,
  event_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists stripe_invoice_sms_holds (
  id text primary key,
  event_id text not null,
  user_id text not null,
  body text not null,
  send_after timestamptz not null,
  status text not null default 'held',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
