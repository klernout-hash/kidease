-- Undo 0237_attendance_booking_key.sql. Fails if two booked rows now share a name and day.
drop index if exists attendance_unbooked_day_child_idx;
drop index if exists attendance_booking_day_idx;
create unique index if not exists attendance_day_child_idx
  on attendance (daycare_id, child_name, day);
