import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthLedger,
  canWriteDayNote,
  dayBucket,
  dollarsToDailyCents,
  evaluateRoom,
  normalizeSplit,
  parentShareDollars,
  ratioRule,
  staffRequired,
} from "../src/lib/licensed-day.ts";

test("Ontario infant ratio is 3 staff for 10 children, not one staff per three", () => {
  const rule = ratioRule("ON", "infant");
  assert.ok(rule);
  assert.equal(staffRequired(1, rule), 1);
  assert.equal(staffRequired(4, rule), 2);
  assert.equal(staffRequired(10, rule), 3);
  const room = evaluateRoom({ province: "ON", ageGroup: "infant", present: 10, staff: 2, capacity: 10 });
  assert.equal(room.overRatio, true);
  assert.equal(room.overGroup, false);
  assert.match(room.rule.citation, /137\/15/);
});

test("a child who is sick or on vacation is not in the room count", () => {
  assert.equal(dayBucket("arrived"), "present");
  assert.equal(dayBucket("departed"), "present");
  assert.equal(dayBucket("sick"), "sick");
  assert.equal(dayBucket("vacation"), "vacation");
  assert.equal(dayBucket("absent"), "absent");
  const room = evaluateRoom({ province: "MB", ageGroup: "toddler", present: 4, staff: 1, capacity: 8 });
  assert.equal(room.overRatio, false);
  assert.equal(room.staffRequired, 1);
  const over = evaluateRoom({ province: "MB", ageGroup: "toddler", present: 5, staff: 1, capacity: 8 });
  assert.equal(over.overRatio, true);
});

test("a province without a loaded ratio does not invent a staff number", () => {
  const room = evaluateRoom({ province: "BC", ageGroup: "infant", present: 6, staff: 1, capacity: 4 });
  assert.equal(room.rule, null);
  assert.equal(room.staffRequired, 0);
  assert.equal(room.overRatio, false);
  assert.equal(room.overGroup, true);
});

test("the month bills days the child was here and leaves sick and vacation off both shares", () => {
  const ledger = buildMonthLedger({
    statuses: ["arrived", "departed", "sick", "vacation", "absent", "scheduled"],
    parentDailyCents: 1000,
    programDailyCents: 2500,
  });
  assert.equal(ledger.present, 2);
  assert.equal(ledger.sick, 1);
  assert.equal(ledger.vacation, 1);
  assert.equal(ledger.absent, 1);
  assert.equal(ledger.parentCents, 2000);
  assert.equal(ledger.programCents, 5000);
  assert.equal(parentShareDollars(2000), 20);
  assert.equal(parentShareDollars(50), null);
});

test("a subsidy split keeps the program share as a record and a none split clears it", () => {
  const split = normalizeSplit({
    parentDailyCents: 1000,
    programDailyCents: 4000,
    programKind: "subsidy",
    programLabel: "  CMSM  ",
  });
  assert.equal(split.programLabel, "CMSM");
  assert.equal(split.programDailyCents, 4000);
  const none = normalizeSplit({ parentDailyCents: 1500, programDailyCents: 4000, programKind: "none" });
  assert.equal(none.programDailyCents, 0);
  assert.equal(dollarsToDailyCents("10.50"), 1050);
  assert.equal(dollarsToDailyCents("10.555"), null);
});

test("the day’s note waits until the day is marked", () => {
  assert.equal(canWriteDayNote("scheduled"), false);
  assert.equal(canWriteDayNote("arrived"), true);
  assert.equal(canWriteDayNote("sick"), true);
  assert.equal(canWriteDayNote("vacation"), true);
});
