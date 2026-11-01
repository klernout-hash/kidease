import assert from "node:assert/strict";
import { test } from "node:test";
import { absenceReportsEnabled, absenceReportsMode, applyAbsence } from "../src/lib/wiring/absence-reports.ts";

test("an absence lowers the room count and does not invent staff", () => {
  assert.equal(absenceReportsEnabled({}), false);
  assert.equal(absenceReportsMode({ FEATURE_ABSENCE_REPORTS: "1" }), "dry_run");
  const missing = applyAbsence({
    alreadyAbsent: false,
    childrenPresent: 8,
    staffOnShift: null,
    province: "MB",
    band: "preschool",
  });
  assert.equal(missing.childrenNow, 7);
  assert.equal(missing.ratio, null);
  const ratio = applyAbsence({
    alreadyAbsent: false,
    childrenPresent: 8,
    staffOnShift: 1,
    province: "MB",
    band: "preschool",
  });
  assert.equal(ratio.childrenNow, 7);
  assert.equal(ratio.ratio?.status, "near");
  const again = applyAbsence({
    alreadyAbsent: true,
    childrenPresent: 7,
    staffOnShift: 1,
    province: "MB",
    band: "preschool",
  });
  assert.equal(again.childrenNow, 7);
});
