-- Renumbered from 0063_parent_alerts_plan.sql so it runs after 0062_listing_merge.sql.
-- Parent Alerts is the second parent paid tier. It writes plus_plan only.
-- Hidden in the product until STRIPE_PRICE_PARENT_ALERTS_MONTHLY and
-- STRIPE_PRICE_PARENT_ALERTS_YEARLY are set.

alter table profiles drop constraint if exists profiles_plus_plan_chk;

alter table profiles
  add constraint profiles_plus_plan_chk
  check (plus_plan in ('free', 'plus', 'alerts'));
