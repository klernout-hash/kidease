-- Draft spot alerts. Counts only. No parent email, phone, or child name.

create table if not exists spot_alert_drafts (
  id text primary key,
  daycare_id text not null,
  actor_user_id text,
  matched int not null default 0,
  fit_age int not null default 0,
  fit_start int not null default 0,
  fit_distance int not null default 0,
  spots_infant int not null default 0,
  spots_toddler int not null default 0,
  spots_preschool int not null default 0,
  body text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spot_alert_drafts_status_chk'
  ) then
    alter table spot_alert_drafts
      add constraint spot_alert_drafts_status_chk
      check (status in ('draft', 'sent'));
  end if;
end $$;

create index if not exists spot_alert_drafts_daycare_idx
  on spot_alert_drafts (daycare_id, created_at desc);

create table if not exists spot_alert_sends (
  id text primary key,
  draft_id text not null references spot_alert_drafts(id) on delete cascade,
  user_id text not null,
  channel text not null,
  status text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spot_alert_sends_channel_chk'
  ) then
    alter table spot_alert_sends
      add constraint spot_alert_sends_channel_chk
      check (channel in ('in_app', 'email'));
  end if;
end $$;

create unique index if not exists spot_alert_sends_uidx
  on spot_alert_sends (draft_id, user_id, channel);
