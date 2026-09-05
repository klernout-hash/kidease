-- Shared KidEase bills. Extends invoices (0013) — one object both desks see.
-- User-facing name is Bill. Amounts stay CAD dollars on invoices.total
-- (same unit as bookings.monthly_amount / payments.amount). amount_cents is
-- the Stripe unit (total * 100). Drafts stay provider-only until Send.

alter table invoices
  add column if not exists child_id text references children(id) on delete set null,
  add column if not exists created_by text,
  add column if not exists amount_cents int,
  add column if not exists platform_fee_cents int,
  add column if not exists net_cents int,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists receipt_url text,
  add column if not exists sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update invoices
  set
    amount_cents = coalesce(amount_cents, greatest(coalesce(total, 0), 0) * 100),
    platform_fee_cents = coalesce(platform_fee_cents, greatest(coalesce(platform_fee, 0), 0) * 100),
    net_cents = coalesce(net_cents, greatest(coalesce(total, 0) - coalesce(platform_fee, 0), 0) * 100)
  where amount_cents is null;

create index if not exists invoices_stripe_session_idx on invoices (stripe_checkout_session_id);
create index if not exists invoices_stripe_pi_idx on invoices (stripe_payment_intent_id);
create index if not exists invoices_child_idx on invoices (child_id);
create index if not exists invoices_created_by_idx on invoices (created_by);
