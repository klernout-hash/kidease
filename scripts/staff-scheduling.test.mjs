import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { parseChildrenPresent, parseShift, planEceReminders, rosterRatio, staffOnShift } from "../src/lib/staff-scheduling.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("staff scheduling stays off and does not text or pay staff", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_STAFF_SCHEDULING, false);
  assert.match(src(".env.example"), /^FEATURE_STAFF_SCHEDULING=0$/m);
  const server = src("src/lib/server/staff-scheduling.ts");
  assert.doesNotMatch(server, /sendSms|FEATURE_SMS/);
  assert.match(server, /sendTransactionalMail/);
  assert.match(src("src/routes/provider.tsx"), /desk === "staff"/);
  assert.doesNotMatch(src("src/lib/desk-nav.ts"), /id: "staff"/);
});

test("a shift stores hours and a ratio uses the centre's child count", () => {
  const shift = parseShift({
    staffName: "Amina K",
    role: "ece",
    roomBand: "infant",
    startsAt: "2026-11-02T13:00:00.000Z",
    endsAt: "2026-11-02T21:00:00.000Z",
  });
  assert.equal(shift.ok, true);
  if (shift.ok) assert.equal(shift.shift.hours, 8);
  assert.equal(parseShift({ staffName: "A", roomBand: "infant", startsAt: "2026-11-02T13:00:00.000Z", endsAt: "2026-11-02T12:00:00.000Z" }).ok, false);
  const on = staffOnShift(
    [{ roomBand: "infant", startsAt: "2026-11-02T13:00:00.000Z", endsAt: "2026-11-02T21:00:00.000Z" }],
    "infant",
    new Date("2026-11-02T15:00:00.000Z"),
  );
  assert.equal(on, 1);
  const ratio = rosterRatio({ province: "ON", band: "infant", childrenPresent: 4, staffOnShift: 1 });
  assert.equal(ratio.staffToChildren, 3);
  assert.equal(ratio.status, "out");
  assert.equal(parseChildrenPresent(""), null);
  assert.equal(parseChildrenPresent(3), 3);
});

test("ECE reminders fire inside 60 days and wait 14 days before repeating", () => {
  const now = new Date("2026-10-31T18:00:00.000Z");
  const due = planEceReminders(
    [
      { id: "soon", staffName: "Amina", expiresOn: "2026-12-01", remindedAt: null },
      { id: "later", staffName: "Bo", expiresOn: "2027-06-01", remindedAt: null },
      { id: "fresh", staffName: "Cia", expiresOn: "2026-11-15", remindedAt: "2026-10-28T18:00:00.000Z" },
    ],
    now,
  );
  assert.deepEqual(due.map((row) => row.id), ["soon"]);
});
