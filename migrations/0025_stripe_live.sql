-- Stripe LIVE customer / subscription ids + bill dispute flag.
-- Price IDs stay in env. This table only stores Stripe object ids (cus_ / sub_ / du_).

alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists plus_plan text not null default 'free',
  add column if not exists plus_interval text not null default 'month',
  add column if not exists plus_status text,
  add column if not exists plus_subscription_id text,
  add column if not exists plus_selected_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plus_plan_chk'
  ) then
    alter table profiles
      add constraint profiles_plus_plan_chk
      check (plus_plan in ('free', 'plus'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plus_interval_chk'
  ) then
    alter table profiles
      add constraint profiles_plus_interval_chk
      check (plus_interval in ('month', 'year'));
  end if;
end $$;

create index if not exists profiles_stripe_customer_idx on profiles (stripe_customer_id);
create index if not exists profiles_stripe_subscription_idx on profiles (stripe_subscription_id);
create index if not exists profiles_plus_subscription_idx on profiles (plus_subscription_id);

alter table invoices
  add column if not exists stripe_dispute_id text,
  add column if not exists disputed_at timestamptz;

create index if not exists invoices_stripe_dispute_idx on invoices (stripe_dispute_id);
