-- Add-ons stay off the centre plan (stripe_subscription_id / selected_plan)
-- and off Parent Plus (plus_subscription_id). One-time add-ons record a payment.
-- catalog_checkout_session_id is the Checkout Session that KidEase has confirmed.

alter table profiles
  add column if not exists featured_city_subscription_id text,
  add column if not exists featured_city_status text,
  add column if not exists claim_boost_payment_id text,
  add column if not exists claim_boost_paid_at timestamptz,
  add column if not exists claim_boost_applied_at timestamptz,
  add column if not exists job_post_credits integer not null default 0,
  add column if not exists job_post_payment_ids text not null default '',
  add column if not exists catalog_checkout_session_id text;

create index if not exists profiles_featured_city_sub_idx
  on profiles (featured_city_subscription_id);

create table if not exists stripe_checkout_errors (
  id text primary key,
  at timestamptz not null default now(),
  user_id text,
  surface text,
  public_message text not null,
  detail text not null
);

create index if not exists stripe_checkout_errors_at_idx
  on stripe_checkout_errors (at desc);
