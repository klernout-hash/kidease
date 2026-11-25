-- Bill payment state from Stripe webhooks (A3): bank debit (PAD) processing,
-- failed payments, and 3D Secure confirmation. Additive only: new nullable
-- columns on invoices and a new payment_mandates table. BillStatus is unchanged.

alter table invoices
  add column if not exists payment_state text null check (payment_state in ('processing','requires_action','failed')),
  add column if not exists processing_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists last_error_code text null,
  add column if not exists overdue_at timestamptz null;

-- One row per Stripe PAD mandate (mandate.updated).
create table if not exists payment_mandates (
  mandate_id text primary key,
  payment_method_id text not null,
  user_id text null,
  status text not null,
  type text not null,
  livemode boolean not null default false,
  updated_at timestamptz not null default now()
);
