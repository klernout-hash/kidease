-- Ghost-mode daycare SaaS plan intent (Free / Pro / Network + add-ons).
-- Checkout is not live — these columns record the selected pick only.
alter table profiles
  add column if not exists selected_plan text not null default 'free',
  add column if not exists selected_interval text not null default 'month',
  add column if not exists selected_addons text not null default '',
  add column if not exists selected_plan_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_selected_plan_chk'
  ) then
    alter table profiles
      add constraint profiles_selected_plan_chk
      check (selected_plan in ('free', 'pro', 'network'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_selected_interval_chk'
  ) then
    alter table profiles
      add constraint profiles_selected_interval_chk
      check (selected_interval in ('month', 'year'));
  end if;
end $$;
