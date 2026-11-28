-- Undo 0237_attendance_per_booking.sql. Restores the per-name unique index.
-- This fails if two children at one centre now share a name on the same day;
-- resolve those rows by hand first. Roll back the app code before running this.
create unique index if not exists attendance_day_child_idx
  on attendance (daycare_id, child_name, day);
drop index if exists attendance_day_child_unlinked_idx;
drop index if exists attendance_day_booking_idx;
