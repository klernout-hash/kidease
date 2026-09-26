-- End-of-period cancel and renewal date per subscription lane.
-- One-time add-ons are not listed here. Cancelling does not delete credits,
-- claim boost, or centre rows.

alter table profiles
  add column if not exists stripe_cancel_at_period_end boolean not null default false,
  add column if not exists stripe_current_period_end timestamptz,
  add column if not exists plus_cancel_at_period_end boolean not null default false,
  add column if not exists plus_current_period_end timestamptz,
  add column if not exists featured_city_cancel_at_period_end boolean not null default false,
  add column if not exists featured_city_current_period_end timestamptz;
