import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CWELCC_DISCLAIMER,
  applySubsidies,
  attendanceSignOffReady,
  cwelccDailyFee,
  monthlySummaryByAge,
  occmsPrintable,
  recordOfAttendance,
  splitFamilyBill,
  yearEndReceipt,
} from "../src/lib/cwelcc.ts";

test("Ontario uses $22 a day or the lower December 31, 2024 fee", () => {
  const capped = cwelccDailyFee({
    province: "ON",
    participating: true,
    eligible: true,
    fullDailyCents: 3000,
    feeOn2024_12_31Cents: 2500,
  });
  assert.equal(capped.parentCents, 2200);
  assert.equal(capped.reductionCents, 800);
  const lower = cwelccDailyFee({
    province: "ON",
    participating: true,
    eligible: true,
    fullDailyCents: 3000,
    feeOn2024_12_31Cents: 1800,
  });
  assert.equal(lower.parentCents, 1800);
  assert.equal(lower.reductionCents, 1200);
  const ineligible = cwelccDailyFee({
    province: "ON",
    participating: true,
    eligible: false,
    fullDailyCents: 3000,
  });
  assert.equal(ineligible.parentCents, 3000);
  assert.equal(ineligible.reductionCents, 0);
});

test("British Columbia and Alberta stay in config and do not invent a grant", () => {
  const site = cwelccDailyFee({
    province: "BC",
    participating: true,
    eligible: true,
    fullDailyCents: 4500,
    tenDollarSite: true,
  });
  assert.equal(site.parentCents, 1000);
  const other = cwelccDailyFee({
    province: "BC",
    participating: true,
    eligible: true,
    fullDailyCents: 4500,
    tenDollarSite: false,
    enteredReductionCents: 500,
  });
  assert.equal(other.parentCents, 4000);
  const alberta = cwelccDailyFee({
    province: "AB",
    participating: true,
    eligible: true,
    fullDailyCents: 2000,
    enteredReductionCents: 300,
  });
  assert.equal(alberta.parentCents, 1700);
  assert.equal(alberta.capAppliedCents, null);
});

test("subsidies, split families, attendance, and the printable stay local", () => {
  const owing = applySubsidies(2200, 400, 200);
  assert.equal(owing.parentOwingCents, 1600);
  assert.equal(owing.provincialCents, 400);
  assert.equal(owing.municipalCents, 200);
  const split = splitFamilyBill(1600, [
    { key: "a", bps: 6000 },
    { key: "b", bps: 4000 },
  ]);
  assert.equal(split.ok, true);
  if (split.ok) assert.deepEqual(split.parts.map((part) => part.cents), [960, 640]);
  assert.equal(splitFamilyBill(1600, [{ key: "a", bps: 5000 }]).ok, false);
  const record = recordOfAttendance(["present", "absent", "closed", "absent"], 1);
  assert.equal(record.present, 1);
  assert.equal(record.absent, 2);
  assert.equal(record.closed, 1);
  assert.equal(record.overAllowance, 1);
  assert.equal(attendanceSignOffReady("staff-1", "staff-1"), false);
  assert.equal(attendanceSignOffReady("staff-1", "staff-2"), true);
  const summary = monthlySummaryByAge([{ ageGroup: "preschool", parentCents: 2200, reductionCents: 800 }]);
  assert.equal(summary.find((row) => row.ageGroup === "preschool")?.children, 1);
  assert.equal(yearEndReceipt([2200, 2200]), 4400);
  const sheet = occmsPrintable([
    {
      child: "A",
      ageGroup: "preschool",
      present: 10,
      absent: 1,
      fullCents: 3000,
      reductionCents: 800,
      parentCents: 2200,
      provincialCents: 0,
      municipalCents: 0,
    },
  ]);
  assert.match(sheet, /not government-affiliated/);
  assert.doesNotMatch(sheet, /submitted to/);
});

test("the fee screen does not call a government system", () => {
  const source = readFileSync(new URL("../src/lib/cwelcc.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/cwelcc-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /CWELCC_DISCLAIMER/);
  assert.equal(CWELCC_DISCLAIMER.includes("not government-affiliated"), true);
  assert.doesNotMatch(source + panel, /occms\.ontario|fetch\(/);
});
