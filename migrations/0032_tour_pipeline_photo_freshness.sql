-- Tour → enrol pipeline statuses + listing photo freshness timestamp.
-- Never backfill invented photo dates. Existing tours stay pending/accepted/declined.

alter table daycares
  add column if not exists last_photo_updated_at timestamptz;

comment on column daycares.last_photo_updated_at is
  'Set only when a director uploads or replaces a storefront/listing photo. Never invented.';

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'tour_requests_status_chk'
  ) then
    alter table tour_requests drop constraint tour_requests_status_chk;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tour_requests_status_chk'
  ) then
    alter table tour_requests
      add constraint tour_requests_status_chk
      check (status in ('pending', 'accepted', 'completed', 'enrolled', 'declined', 'lost'));
  end if;
end $$;
