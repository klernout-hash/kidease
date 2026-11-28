-- Attendance is one row per enrolment (booking) and day, not per child name.
-- Apply by hand (Neon SQL), never via npm run db:migrate. Undo: migrations/down/0237_attendance_per_booking.sql
-- Deploy order: apply this migration BEFORE the code that writes
-- `on conflict (daycare_id, booking_id, day) where booking_id is not null`.
--
-- The old unique index (daycare_id, child_name, day) let one family overwrite
-- another family's row by giving their child the same name. Rows linked to a
-- booking are now unique per (daycare_id, booking_id, day). Older rows with no
-- booking keep the name key so staff-only entries still upsert.
--
-- No rows are deleted. If a rename left two rows on the same booking and day,
-- only the newest keeps the booking link; the older one keeps its name and data.
-- Safe to run more than once.

update attendance a
set booking_id = null
where a.booking_id is not null
  and exists (
    select 1 from attendance b
    where b.daycare_id = a.daycare_id
      and b.booking_id = a.booking_id
      and b.day = a.day
      and (b.created_at, b.id) > (a.created_at, a.id)
  );

create unique index if not exists attendance_day_booking_idx
  on attendance (daycare_id, booking_id, day)
  where booking_id is not null;

create unique index if not exists attendance_day_child_unlinked_idx
  on attendance (daycare_id, child_name, day)
  where booking_id is null;

drop index if exists attendance_day_child_idx;
