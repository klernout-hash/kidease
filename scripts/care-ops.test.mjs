import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildRoomCounts,
  canAssignRoster,
  canLogMedicationDose,
  canManageRooms,
  canScheduleMedication,
  canSubmitIncident,
  CARE_OPS_LATER_OUT_OF_SCOPE,
  careStatusBody,
  clampRoomCapacity,
  DAILY_CARE_HONESTY,
  incidentPostReady,
  latestLogForSlot,
  medicationActiveOnDay,
  medicationPostReady,
  parseScheduleTimes,
} from "../src/lib/daily-care.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { inAppChatEnabled, smsEnabled } from "../src/lib/features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("medication schedule and append-only dose log helpers", () => {
  assert.deepEqual(parseScheduleTimes("08:00, 12:00, 08:00"), ["08:00", "12:00"]);
  assert.deepEqual(parseScheduleTimes(["9:00", "12:00"]), ["12:00"]);
  assert.equal(medicationPostReady({ name: "Tylenol", dosage: "5 ml", times: ["08:00"] }), true);
  assert.equal(medicationPostReady({ name: "", dosage: "5 ml", times: ["08:00"] }), false);
  assert.equal(
    medicationActiveOnDay({ startDay: "2026-09-15", endDay: null, day: "2026-09-15" }),
    true,
  );
  assert.equal(
    medicationActiveOnDay({ startDay: "2026-09-16", endDay: null, day: "2026-09-15" }),
    false,
  );
  assert.equal(canScheduleMedication("parent"), true);
  assert.equal(canLogMedicationDose("parent"), false);
  assert.equal(canLogMedicationDose("provider"), true);
  const latest = latestLogForSlot({
    logs: [
      { medicationId: "m1", day: "2026-09-15", scheduledTime: "08:00", createdAt: "2026-09-15T12:00:00Z", status: "missed" },
      { medicationId: "m1", day: "2026-09-15", scheduledTime: "08:00", createdAt: "2026-09-15T13:00:00Z", status: "given" },
    ],
    medicationId: "m1",
    day: "2026-09-15",
    scheduledTime: "08:00",
  });
  assert.equal(latest?.status, "given");
  assert.match(careStatusBody({ kind: "medication", childName: "Ada", daycareName: "Bonnie", medicationName: "Tylenol", doseStatus: "given" }), /Tylenol/);
});

test("incident reports require a kind and description; staff file them", () => {
  assert.equal(incidentPostReady({ kind: "fall", description: "Bumped the climber." }), true);
  assert.equal(incidentPostReady({ kind: "fall", description: "  " }), false);
  assert.equal(incidentPostReady({ kind: "explosion", description: "nope" }), false);
  assert.equal(canSubmitIncident("provider"), true);
  assert.equal(canSubmitIncident("parent"), false);
  assert.match(careStatusBody({ kind: "incident", childName: "Ada", daycareName: "Bonnie", incidentKind: "fall" }), /Incident report/);
});

test("room counts use attendance presence versus room capacity", () => {
  assert.equal(clampRoomCapacity(0), 1);
  assert.equal(clampRoomCapacity(200), 80);
  const rows = buildRoomCounts({
    rooms: [{ id: "r1", daycareId: "d1", daycareName: "Bonnie", name: "Toddlers", capacity: 2 }],
    assignments: [
      { daycareId: "d1", bookingId: "b1", childName: "Ada", roomId: "r1" },
      { daycareId: "d1", bookingId: "b2", childName: "Bo", roomId: "r1" },
      { daycareId: "d1", bookingId: "b3", childName: "Cy", roomId: "r1" },
    ],
    attendance: [
      { daycareId: "d1", bookingId: "b1", childName: "Ada", status: "arrived" },
      { daycareId: "d1", bookingId: "b2", childName: "Bo", status: "arrived" },
      { daycareId: "d1", bookingId: "b3", childName: "Cy", status: "scheduled" },
    ],
    roster: [{ roomId: "r1", staffName: "Sam" }],
  });
  assert.equal(rows[0].assigned, 3);
  assert.equal(rows[0].present, 2);
  assert.equal(rows[0].overCapacity, false);
  assert.deepEqual(rows[0].staffNames, ["Sam"]);
  assert.equal(canManageRooms("provider"), true);
  assert.equal(canAssignRoster("parent"), false);
});

test("NEXT ops surfaces, migrations, and transactional notices; LATER stays out of scope", () => {
  assert.match(DAILY_CARE_HONESTY, /medication/);
  assert.match(DAILY_CARE_HONESTY, /timesheets/);
  assert.match(CARE_OPS_LATER_OUT_OF_SCOPE, /timesheets/);
  assert.match(CARE_OPS_LATER_OUT_OF_SCOPE, /tuition billing/);
  const migration = src("migrations/0051_care_ops_next.sql");
  assert.match(migration, /create table if not exists care_medications/);
  assert.match(migration, /create table if not exists care_medication_logs/);
  assert.match(migration, /create table if not exists care_incidents/);
  assert.match(migration, /create table if not exists care_rooms/);
  assert.match(migration, /create table if not exists care_roster_assignments/);
  assert.doesNotMatch(migration, /create table if not exists care_timesheets/);
  assert.doesNotMatch(migration, /create table if not exists (staff_timesheets|payroll|tuition|subsid)/);
  const migrationNames = readdirSync(join(root, "migrations")).join(" ");
  assert.doesNotMatch(migrationNames, /timesheet|payroll/);
  assert.match(src("src/lib/server/care-ops.ts"), /insertCareStatusMessage/);
  assert.match(src("src/lib/server/care-ops.ts"), /centreCanWriteCare/);
  assert.match(src("src/components/care-ops-panel.tsx"), /data-ke="care-ops-rooms"/);
  assert.match(src("src/components/care-child-ops.tsx"), /data-ke="care-child-ops"/);
  assert.match(src("src/components/care-child-ops.tsx"), /logCareMedicationDose/);
  assert.match(src("src/components/care-child-ops.tsx"), /submitCareIncident/);
  assert.match(src("src/lib/copy.ts"), /careLaterOut:/);
  assert.equal(FLAG_DEFAULTS.FEATURE_INAPP_CHAT, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SMS, false);
  assert.equal(inAppChatEnabled({}), false);
  assert.equal(smsEnabled({}), false);
  assert.doesNotMatch(src("src/lib/server/care-ops.ts"), /FEATURE_INAPP_CHAT|FEATURE_SMS|sendSms/);
  assert.doesNotMatch(src("src/components/care-ops-panel.tsx"), /timesheet|payroll|video\/mp4/);
  assert.doesNotMatch(src("src/lib/now-loops.ts"), /care-ops|care_medications|care_incidents/);
});
