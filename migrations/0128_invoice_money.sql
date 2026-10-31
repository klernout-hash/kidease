-- Saved Stripe payment method ids and invoice instalments.
-- No card number. No KidEase subscription.

create table if not exists saved_payment_methods (
  id text primary key,
  user_id text not null,
  brand text not null,
  last4 text not null,
  payment_method_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_payment_methods_user_idx on saved_payment_methods (user_id);

create table if not exists invoice_autopay (
  invoice_id text primary key,
  user_id text not null,
  payment_method_id text not null,
  consented_at timestamptz not null default now()
);

create table if not exists invoice_instalments (
  id text primary key,
  invoice_id text not null,
  part_index int not null,
  amount_cents int not null,
  created_at timestamptz not null default now()
);
