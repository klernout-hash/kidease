import test from "node:test";
import assert from "node:assert/strict";
import { centreToolIds } from "../src/lib/features.ts";
import { CENTRE_TOOLS, parentKindsFor, quickbooksCsv, tapToPayDecision, clampTapTime, attendanceBill } from "../src/lib/centre-tools.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("every centre tool flag defaults off", () => {
  for (const tool of CENTRE_TOOLS) assert.equal(FLAG_DEFAULTS[tool.flag], false, tool.flag);
  assert.deepEqual(centreToolIds({}), []);
});

test("parent kinds only from on tools", () => {
  assert.deepEqual(parentKindsFor([]), []);
  assert.ok(parentKindsFor(["meals"]).includes("menu"));
  assert.ok(!parentKindsFor(["pd", "payroll"]).length);
});

test("quickbooks csv neutralizes formulas", () => {
  const csv = quickbooksCsv([{ number: "1", customer: "=cmd", date: "2026-11-01", due: "2026-11-15", item: "Care", amountCents: 1000 }]);
  assert.ok(!csv.includes(",=cmd"));
  assert.ok(csv.includes("Exempt"));
});

test("tap to pay never charges", () => {
  assert.equal(tapToPayDecision(true, true, 500).ok, false);
  assert.equal(tapToPayDecision(false, true, 500).ok, false);
});

test("offline tap time never in the future", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(clampTapTime("2026-11-03T12:00:00Z", now), null);
  assert.equal(clampTapTime("2026-10-30T12:00:00Z", now), null);
  assert.ok(clampTapTime("2026-11-02T08:00:00Z", now));
});

test("attendance bill counts attended days", () => {
  const bill = attendanceBill({ month: "2026-11", attendedDays: ["2026-11-02", "2026-11-03", "2026-10-30"], scheduledDays: 4, dailyFeeCents: 2200, chargeAbsent: false, sickDaysAllowed: 0, subsidyPercent: 75, agency: "CMSM" });
  assert.equal(bill.attended, 2);
  assert.equal(bill.grossCents, 4400);
  assert.equal(bill.agencyCents + bill.parentCents, 4400);
  assert.equal(bill.agencyCents, 3300);
});
