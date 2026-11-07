-- Provider-confirmed meal details. Empty object means unknown, not "no meals".
-- Reverse: migrations/down/0179_meal_offerings.sql

alter table daycares add column if not exists meal_offerings jsonb not null default '{}'::jsonb;

comment on column daycares.meal_offerings is
  'Provider-confirmed meals, drinks, source, price, and diet options. Missing keys stay unknown.';
