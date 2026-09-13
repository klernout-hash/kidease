-- Tour soft-hold SLA (Sprint 2b).
-- Parent book → pending hold (48h). Expired / declined / lost free the seat.
-- Inventory is derived: Open / Soft-hold / Confirmed / Blocked.
-- Not Instant Book for childcare placement.

alter table tour_requests
  add column if not exists hold_expires_at timestamptz;

update tour_requests
  set hold_expires_at = created_at + interval '48 hours'
  where status = 'pending' and hold_expires_at is null;

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
      check (status in ('pending', 'accepted', 'completed', 'enrolled', 'declined', 'lost', 'expired'));
  end if;
end $$;

create index if not exists tour_requests_hold_expires_idx
  on tour_requests (status, hold_expires_at)
  where status = 'pending';
