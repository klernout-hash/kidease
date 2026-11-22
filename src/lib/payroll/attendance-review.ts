/** Read-only view of recorded payroll punches. It never calculates wages or deductions. */
import { paidMinutes } from "./hours.ts";

type Rows = {
  query<T>(text: string, params: unknown[]): Promise<T[]>;
};

export type AttendanceOption = { id: string; name: string };
export type AttendancePunch = {
  id: string;
  clockIn: string;
  clockOut: string | null;
  recordedMinutes: number | null;
  approved: boolean;
};

export type AttendanceReview =
  | { kind: "off" | "denied" | "missing" }
  | { kind: "centres"; options: AttendanceOption[] }
  | { kind: "staff"; options: AttendanceOption[] }
  | { kind: "punches"; rows: AttendancePunch[]; more: boolean };

type StoredPunch = {
  id: string;
  clock_in_at: Date | string;
  clock_out_at: Date | string | null;
  unpaid_break_minutes: number;
  approval_status: string;
};

const PUNCH_LIMIT = 100;

export async function readAttendanceReview(
  sql: Rows,
  ownerId: string,
  daycareId: string,
  employeeId: string,
): Promise<AttendanceReview> {
  if (!ownerId) return { kind: "denied" };
  if (!daycareId) {
    if (employeeId) return { kind: "denied" };
    const options = await sql.query<AttendanceOption>(
      `select d.id, d.name
       from daycares d
       join provider_daycares o on o.daycare_id = d.id
       where o.user_id = $1
       order by d.name, d.id`,
      [ownerId],
    );
    return { kind: "centres", options };
  }

  // The ownership predicate stays in every data query, including after a centre selection.
  if (!employeeId) {
    const options = await sql.query<AttendanceOption>(
      `select e.id, e.display_name as name
       from payroll_employees e
       join provider_daycares o on o.daycare_id = e.daycare_id
       where o.user_id = $1 and e.daycare_id = $2
       order by e.display_name, e.id`,
      [ownerId, daycareId],
    );
    return { kind: "staff", options };
  }

  const matched = await sql.query<{ id: string }>(
    `select e.id
     from payroll_employees e
     join provider_daycares o on o.daycare_id = e.daycare_id
     where o.user_id = $1 and e.daycare_id = $2 and e.id = $3`,
    [ownerId, daycareId, employeeId],
  );
  if (!matched.length) return { kind: "missing" };

  const records = await sql.query<StoredPunch>(
    `select p.id, p.clock_in_at, p.clock_out_at, p.unpaid_break_minutes, p.approval_status
     from payroll_punches p
     join payroll_employees e on e.id = p.employee_id and e.daycare_id = p.daycare_id
     join provider_daycares o on o.daycare_id = e.daycare_id
     where o.user_id = $1 and e.daycare_id = $2 and e.id = $3
       and (p.clock_out_at is null or p.clock_in_at >= now() - interval '14 days')
     order by p.clock_in_at desc, p.id
     limit $4`,
    [ownerId, daycareId, employeeId, PUNCH_LIMIT + 1],
  );
  return {
    kind: "punches",
    more: records.length > PUNCH_LIMIT,
    rows: records.slice(0, PUNCH_LIMIT).map((row) => {
      const clockIn = new Date(row.clock_in_at).toISOString();
      const clockOut = row.clock_out_at ? new Date(row.clock_out_at).toISOString() : null;
      const elapsedMinutes = clockOut ? (Date.parse(clockOut) - Date.parse(clockIn)) / 60_000 : 0;
      const breakMinutes = row.unpaid_break_minutes;
      const recordedMinutes =
        clockOut &&
        Number.isInteger(breakMinutes) &&
        breakMinutes >= 0 &&
        breakMinutes <= elapsedMinutes
          ? paidMinutes({
              clockIn,
              clockOut,
              unpaidBreakMinutes: row.unpaid_break_minutes,
              roundStep: 0,
            })
          : null;
      return {
        id: row.id,
        clockIn,
        clockOut,
        recordedMinutes,
        approved: row.approval_status === "approved",
      };
    }),
  };
}
