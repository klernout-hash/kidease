-- Parent shortlist tracker and one shared list per invite.
-- Notes stay private to the owner and an accepted partner.

alter table saved_daycares add column if not exists track_status text not null default 'interested';
alter table saved_daycares add column if not exists call_note text not null default '';
alter table saved_daycares add column if not exists tour_note text not null default '';

alter table saved_daycares drop constraint if exists saved_daycares_track_status_chk;
alter table saved_daycares
  add constraint saved_daycares_track_status_chk
  check (track_status in ('interested', 'called', 'toured', 'waitlisted', 'enrolled'));

create table if not exists shortlist_shares (
  id text primary key,
  owner_user_id text not null,
  invite_email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  accepted_user_id text,
  accepted_at timestamptz
);

create index if not exists shortlist_shares_owner_idx on shortlist_shares (owner_user_id);
create index if not exists shortlist_shares_accepted_idx on shortlist_shares (accepted_user_id);
