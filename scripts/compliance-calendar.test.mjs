import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { calendarMode, isOverdue, licenceTerm, reminderDue, reminderPlan } from "../src/lib/compliance/calendar.ts";
import { canSeeProvince } from "../src/lib/compliance/mode.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("compliance calendar stays off until both flags are on", () => {
  assert.equal(calendarMode({}), "off");
  assert.equal(calendarMode({ FEATURE_COMPLIANCE_CALENDAR: "1" }), "dry_run");
  assert.equal(calendarMode({ FEATURE_COMPLIANCE_CALENDAR: "1", FEATURE_COMPLIANCE_CALENDAR_LIVE: "1" }), "live");
  const plan = reminderPlan({
    mode: "dry_run",
    dueOn: "2026-04-01",
    today: "2026-03-02",
    completed: false,
    alreadyRemindedDay: null,
  });
  assert.equal(plan.day, 30);
  assert.equal(plan.delivery, "log");
  assert.equal(reminderDue("2026-05-01", "2026-03-02"), 60);
  assert.equal(reminderDue("2026-04-01", "2026-03-25"), 7);
  assert.equal(isOverdue("2026-01-01", "2026-02-01", false), true);
  assert.equal(isOverdue("2026-01-01", "2026-02-01", true), false);
});

test("Manitoba and Ontario licence terms are cited", () => {
  assert.equal(licenceTerm("MB")?.months, 12);
  assert.equal(licenceTerm("MB")?.verified, true);
  assert.match(licenceTerm("MB")?.source || "", /17\/99/);
  assert.equal(licenceTerm("ON")?.months, 24);
  assert.equal(licenceTerm("ON")?.verified, true);
  assert.equal(licenceTerm("BC")?.verified, false);
  assert.equal(canSeeProvince({ role: "government", govProvince: "MB", rowProvince: "ON" }), false);
});

test("calendar pages keep help and default the flags off", () => {
  assert.match(src(".env.example"), /^FEATURE_COMPLIANCE_CALENDAR=0$/m);
  assert.match(src(".env.example"), /^FEATURE_COMPLIANCE_CALENDAR_LIVE=0$/m);
  assert.match(src("src/components/compliance/frame.tsx"), /href="\/help"/);
  assert.match(src("src/routes/gov_.compliance.tsx"), /guardGovDesk/);
  assert.match(src("src/routes/admin-gov-compliance.tsx"), /beforeLoadAdminDesk/);
  assert.match(src("migrations/0147_gov_compliance_calendar.sql"), /gov_province/);
});
