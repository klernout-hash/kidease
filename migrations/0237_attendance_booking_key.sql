-- Key attendance on the booking, not the child's typed name.
-- Apply by hand (Neon SQL), never via npm run db:migrate. Undo: migrations/down/0237_attendance_booking_key.sql
--
-- Two children at one centre can share a name, and a parent can rename their
-- own child. A name key let one family's save land on another family's row.
-- Ship together with the code that upserts on (daycare_id, booking_id, day).

-- A renamed child can hold two rows for one booking and day. Keep the newest
-- on the booking; older ones stay as booking-less history under their own name.
update attendance a
set booking_id = null
from (
  select id, row_number() over (
    partition by daycare_id, booking_id, day
    order by created_at desc, id desc
  ) as rn
  from attendance
  where booking_id is not null
) ranked
where ranked.id = a.id and ranked.rn > 1;

drop index if exists attendance_day_child_idx;

create unique index if not exists attendance_booking_day_idx
  on attendance (daycare_id, booking_id, day);

-- Staff rows saved without a booking still need one row per name and day.
create unique index if not exists attendance_unbooked_day_child_idx
  on attendance (daycare_id, child_name, day) where booking_id is null;
