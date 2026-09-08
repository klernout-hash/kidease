-- Saved home / work search anchors for signed-in parents.
-- Guest search still uses localStorage (kidease-origin + kidease-dual-anchor).

alter table profiles add column if not exists home_lat double precision;
alter table profiles add column if not exists home_lng double precision;
alter table profiles add column if not exists home_label text;
alter table profiles add column if not exists work_lat double precision;
alter table profiles add column if not exists work_lng double precision;
alter table profiles add column if not exists work_label text;
alter table profiles add column if not exists search_anchor_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_search_anchor_mode_chk'
  ) then
    alter table profiles
      add constraint profiles_search_anchor_mode_chk
      check (search_anchor_mode is null or search_anchor_mode in ('home', 'work', 'both'));
  end if;
end $$;
