-- Tour → enrol pipeline statuses.
-- Existing tours stay pending/accepted/declined. Never invent a status.
-- Photo freshness lives in 0032_photo_freshness.sql.

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
