-- Free daycare waitlist and 48-hour spot offers.
-- No fee column. Included on every plan. Email is a separate flag, default off.

create table if not exists daycare_waitlist (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  user_id text not null,
  age_group text not null,
  child_label text,
  note text,
  status text not null default 'waiting',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daycare_waitlist_age_chk'
  ) then
    alter table daycare_waitlist
      add constraint daycare_waitlist_age_chk
      check (age_group in ('infant', 'toddler', 'preschool', 'any'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'daycare_waitlist_status_chk'
  ) then
    alter table daycare_waitlist
      add constraint daycare_waitlist_status_chk
      check (status in ('waiting', 'offered', 'accepted', 'declined', 'expired', 'withdrawn'));
  end if;
end $$;

create index if not exists daycare_waitlist_daycare_idx
  on daycare_waitlist (daycare_id, joined_at);

create unique index if not exists daycare_waitlist_active_uidx
  on daycare_waitlist (daycare_id, user_id)
  where status in ('waiting', 'offered');

create table if not exists spot_offers (
  id text primary key,
  waitlist_id text not null references daycare_waitlist(id) on delete cascade,
  daycare_id text not null,
  user_id text not null,
  age_group text not null,
  status text not null default 'open',
  offered_at timestamptz not null,
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spot_offers_age_chk'
  ) then
    alter table spot_offers
      add constraint spot_offers_age_chk
      check (age_group in ('infant', 'toddler', 'preschool', 'any'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'spot_offers_status_chk'
  ) then
    alter table spot_offers
      add constraint spot_offers_status_chk
      check (status in ('open', 'accepted', 'declined', 'expired'));
  end if;
end $$;

create index if not exists spot_offers_daycare_idx
  on spot_offers (daycare_id, offered_at desc);

create unique index if not exists spot_offers_one_open_idx
  on spot_offers (daycare_id)
  where status = 'open';
