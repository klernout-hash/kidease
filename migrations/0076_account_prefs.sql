-- Per-account appearance, and a 30-day window before a confirmed deletion is final.
alter table profiles add column if not exists theme text not null default 'system';
alter table profiles add column if not exists deleted_at timestamptz;

alter table profiles drop constraint if exists profiles_theme_chk;
alter table profiles
  add constraint profiles_theme_chk check (theme in ('light', 'dark', 'system'));
