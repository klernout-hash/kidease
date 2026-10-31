-- Allow a daycare to mark a confirmed tour as a no-show.
-- FEATURE_TOUR_PIPELINE stays off until Kyle turns it on.

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
      check (status in ('pending', 'accepted', 'completed', 'enrolled', 'declined', 'lost', 'expired', 'no_show'));
  end if;
end $$;
