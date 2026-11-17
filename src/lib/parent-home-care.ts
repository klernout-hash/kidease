import { isEnrolledBookingStatus } from "./daily-care.ts";
import type { Booking } from "./types.ts";
import type { listMyChildAttendance } from "./server/child-checkin.ts";
import type { DailyJournalRow } from "./server/daily-care.ts";

export type ParentHomeAttendance = Awaited<
  ReturnType<typeof listMyChildAttendance>
>["children"][number];
export type ParentHomeCareSnapshot = {
  attendanceEnabled: boolean;
  journalsEnabled: boolean;
  attendance: ParentHomeAttendance[];
  journals: DailyJournalRow[];
};

/** An enrolled booking is the join key. Names alone do not identify a child. */
export function parentHomeCareRows(bookings: readonly Booking[], snapshot: ParentHomeCareSnapshot) {
  return bookings
    .filter((booking) => isEnrolledBookingStatus(booking.status))
    .map((booking) => {
      const attendance = snapshot.attendance.find((row) => row.bookingId === booking.id);
      const journal =
        attendance && snapshot.journalsEnabled
          ? snapshot.journals
              .filter(
                (row) =>
                  row.bookingId === booking.id &&
                  row.daycareId === booking.daycareId &&
                  row.day === attendance.localDay &&
                  row.body.trim() &&
                  Number.isFinite(Date.parse(row.createdAt)),
              )
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
          : undefined;
      return { booking, attendance, journal };
    });
}
