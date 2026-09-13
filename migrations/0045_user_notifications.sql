-- In-app notification inbox. Rows are projected from real events (leads, tours,
-- claims, inbox, search alerts, admin queue) and persist so a viewed item
-- stays on the list. Push / FCM is out of scope. Fail closed: unread is 0
-- when this table is missing or a query errors.

create table if not exists user_notifications (
  id text primary key,
  user_id text not null,
  kind text not null,
  title_key text not null,
  href text not null,
  source_key text not null,
  daycare_name text,
  status text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_notifications_kind_chk'
  ) then
    alter table user_notifications
      add constraint user_notifications_kind_chk
      check (kind in ('lead', 'tour', 'claim', 'inbox', 'search_alert', 'admin_queue'));
  end if;
end $$;

create unique index if not exists user_notifications_source_uidx
  on user_notifications (user_id, source_key);

create index if not exists user_notifications_user_unread_idx
  on user_notifications (user_id, read_at, created_at desc);
