import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { staffTimesheetsEnabled } from "../src/lib/features.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import {
  formatToronto,
  planClockIn,
  planClockOut,
  planTimesheetEdit,
  timesheetCsv,
  torontoLocalToIso,
  torontoWeek,
  weeklyTotals,
} from "../src/lib/timesheet.ts";
import { timesheetCopy } from "../src/lib/timesheet-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("staff timesheets stay off and do not pay or text staff", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_STAFF_TIMESHEETS, false);
  assert.equal(staffTimesheetsEnabled({}), false);
  assert.equal(staffTimesheetsEnabled({ FEATURE_STAFF_TIMESHEETS: "1" }), true);
  assert.match(src(".env.example"), /^FEATURE_STAFF_TIMESHEETS=0$/m);
  const server = src("src/lib/server/timesheets.ts");
  assert.doesNotMatch(server, /sendSms|sendTransactionalMail|twilio|payroll/i);
  assert.match(server, /staff_time_edits/);
  assert.match(src("migrations/0159_staff_timesheets.sql"), /staff_time_entries/);
  assert.equal(visibleDeskNav("daycare", { centreOwner: true }).some((item) => item.id === "hours"), false);
  assert.equal(
    visibleDeskNav("daycare", { centreOwner: true, staffTimesheets: true }).some((item) => item.id === "hours"),
    true,
  );
  const page = src("src/components/staff-timesheet-desk.tsx") + src("src/lib/timesheet-copy.ts");
  assert.doesNotMatch(page, /subscription|sponsored|USD|\$\d|payroll|free forever/i);
  assert.match(timesheetCopy("en").noPay, /does not pay wages/);
  assert.match(timesheetCopy("fr").noPay, /salaire/);
});

test("clock in, clock out, and an edit keep an audit trail", () => {
  const started = planClockIn({ staffName: "Ada K", at: new Date("2026-11-02T13:00:00.000Z"), openNames: [] });
  assert.equal(started.ok, true);
  const blocked = planClockIn({ staffName: "ada k", at: new Date("2026-11-02T14:00:00.000Z"), openNames: ["Ada K"] });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "open");
  const entry = { id: "tim_1", staffName: "Ada K", clockIn: "2026-11-02T13:00:00.000Z", clockOut: null };
  const closed = planClockOut(entry, new Date("2026-11-02T21:00:00.000Z"));
  assert.equal(closed.ok, true);
  assert.equal(closed.hours, 8);
  assert.equal(closed.change.field, "clock_out");
  assert.equal(closed.change.before, "");
  const again = planClockOut({ ...entry, clockOut: closed.clockOut }, new Date("2026-11-02T22:00:00.000Z"));
  assert.equal(again.ok, false);
  const tooLong = planClockOut(entry, new Date("2026-11-03T08:00:00.000Z"));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.error, "long");
  const edited = planTimesheetEdit({
    entry: { ...entry, clockOut: "2026-11-02T21:00:00.000Z" },
    staffName: "Ada B",
    note: "Wrong name",
  });
  assert.equal(edited.ok, true);
  assert.equal(edited.changes.length, 1);
  assert.equal(edited.changes[0].field, "staff_name");
  assert.equal(edited.changes[0].before, "Ada K");
  assert.equal(edited.changes[0].after, "Ada B");
  assert.equal(edited.note, "Wrong name");
  assert.equal(planTimesheetEdit({ entry, note: "x" }).ok, false);
  assert.equal(planTimesheetEdit({ entry, staffName: "Ada K", note: "Same row" }).error, "same");
});

test("weekly totals use a Monday week in Toronto and the CSV has no pay columns", () => {
  const week = torontoWeek(new Date("2026-11-04T15:00:00.000Z"));
  assert.equal(week.startIso, "2026-11-02T05:00:00.000Z");
  assert.equal(week.endIso, "2026-11-09T05:00:00.000Z");
  assert.equal(week.label, "2026-11-02 to 2026-11-08");
  assert.equal(formatToronto("2026-11-02T13:00:00.000Z"), "2026-11-02 08:00");
  assert.equal(torontoLocalToIso("2026-11-02T08:00"), "2026-11-02T13:00:00.000Z");
  const entries = [
    { id: "a", staffName: "Ada K", clockIn: "2026-11-02T13:00:00.000Z", clockOut: "2026-11-02T21:00:00.000Z" },
    { id: "b", staffName: "Ada K", clockIn: "2026-11-03T13:00:00.000Z", clockOut: null },
    { id: "c", staffName: "Sam", clockIn: "2026-11-01T20:00:00.000Z", clockOut: "2026-11-02T02:00:00.000Z" },
  ];
  const totals = weeklyTotals(entries, week);
  assert.deepEqual(totals, [
    { staffName: "Ada K", hours: 8, open: 1 },
  ]);
  const csv = timesheetCsv({ entries: entries.slice(0, 2), totals, locale: "en" });
  assert.match(csv, /^Staff,Clock in,Clock out,Hours/);
  assert.match(csv, /Hours this week/);
  assert.match(csv, /Ada K,8\.0/);
  assert.doesNotMatch(csv, /\$|USD|payroll|wage/i);
  const fr = timesheetCsv({ entries: [], totals: [], locale: "fr" });
  assert.match(fr, /Personnel,Arrivée,Départ,Heures/);
  assert.match(fr, /Heures cette semaine/);
});
