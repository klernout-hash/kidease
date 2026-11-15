import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CENTRE_WRITE_ACTIONS, canWrite } from "../src/lib/centre-roles.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const MUTATIONS = [
  ["src/lib/server/child-checkin.ts", "recordChildCheck", "check_in"],
  ["src/lib/server/claims.ts", "refreshVacancy", "vacancy"],
  ["src/lib/server/waitlist-api.ts", "pulseWaitlistSpot", "waitlist_notify"],
  ["src/lib/server/centre-documents.ts", "assertCentreManager", "document_upload"],
  ["src/lib/server/daily-care.ts", "postDailyJournal", "care"],
  ["src/lib/server/daily-care.ts", "logDailyCare", "care"],
  ["src/lib/server/care-ops.ts", "requireStaffWrite", "care"],
  ["src/lib/server/provider-screening.ts", "generateScreeningLetter", "screening"],
  ["src/lib/server/provider-screening.ts", "saveScreeningUpload", "screening"],
  ["src/lib/server/timesheets.ts", "clockInTimesheet", "assertClock"],
  ["src/lib/server/centre-tools.ts", "saveCentreToolRecord", "meal_plan"],
  ["src/lib/server/host-calendar.ts", "saveHostCalendarDay", "calendar"],
  ["src/lib/server/ops.ts", "saveAttendance", "read_only"],
];

test("read-only cannot write, and staff can still check a child in", () => {
  for (const action of CENTRE_WRITE_ACTIONS) {
    assert.equal(canWrite("read_only", action), false, action);
    assert.equal(canWrite(null, action), false, action);
  }
  assert.equal(canWrite("staff", "check_in"), true);
  assert.equal(canWrite("manager", "check_in"), true);
  assert.equal(canWrite("owner", "check_in"), true);
  assert.equal(canWrite("staff", "waitlist_notify"), true);
  assert.equal(canWrite("staff", "document_upload"), false);
  assert.equal(canWrite("manager", "document_upload"), true);
  assert.equal(canWrite("staff", "contracts"), false);
  assert.equal(canWrite("owner", "contracts"), true);
});

test("every listed provider mutation rejects a read-only write", () => {
  for (const [file, fn, marker] of MUTATIONS) {
    const source = read(file);
    const start = source.indexOf(`function ${fn}`) >= 0 ? source.indexOf(`function ${fn}`) : source.indexOf(`const ${fn}`);
    assert.ok(start >= 0, `${file} ${fn}`);
    const body = source.slice(start, start + 1800);
    if (marker === "read_only" || marker === "assertClock") {
      assert.match(body, new RegExp(marker), `${file} ${fn}`);
    } else {
      assert.match(body, new RegExp(`assertCanWrite\\([\\s\\S]{0,240}"${marker}"|canWrite\\([\\s\\S]{0,80}"${marker}"`), `${file} ${fn}`);
    }
    if (marker !== "assertClock") {
      assert.match(body, /assertCanWrite|centreActionDenied|canWrite/, `${file} ${fn}`);
    }
  }
  assert.match(read("src/lib/server/timesheets.ts"), /assertCanWrite\(sql, userId, daycareId, "clock_in"\)/);
  const calendar = read("src/lib/server/host-calendar.ts");
  const load = calendar.slice(calendar.indexOf("const loadHostCalendar"), calendar.indexOf("const saveHostCalendarDay"));
  assert.match(load, /hasCentreDeskAccess/);
  assert.doesNotMatch(load, /assertCanWrite/);
});
