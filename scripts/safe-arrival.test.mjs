import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifySafeArrival, safeArrivalGate, safeArrivalSend } from "../src/lib/safe-arrival.ts";
import { planUnifiedScan } from "../src/lib/unified-alert-scan.ts";
import { decideUnifiedAlert } from "../src/lib/unified-alerts.ts";

const now = new Date("2026-11-09T09:30:00.000Z");

test("absent without notice and late pickup need consent and today", () => {
  assert.equal(
    classifySafeArrival({
      nowMinutes: 9 * 60,
      dropOff: "08:00",
      pickUp: "16:00",
      checkedIn: false,
      checkedOut: false,
      parentNotified: false,
    }),
    "absent_without_notice",
  );
  assert.equal(
    classifySafeArrival({
      nowMinutes: 9 * 60,
      dropOff: "08:00",
      pickUp: "16:00",
      checkedIn: false,
      checkedOut: false,
      parentNotified: true,
    }),
    null,
  );
  assert.equal(
    classifySafeArrival({
      nowMinutes: 17 * 60,
      dropOff: "08:00",
      pickUp: "16:00",
      checkedIn: true,
      checkedOut: false,
      parentNotified: false,
    }),
    "late_pickup",
  );
  assert.equal(safeArrivalGate({ consent: false, day: "2026-11-09", now }).reason, "consent");
  assert.equal(safeArrivalGate({ consent: true, day: "2026-11-08", now }).reason, "past");
  assert.equal(safeArrivalGate({ consent: true, day: "2026-11-09", now }).record, true);
  assert.equal(safeArrivalSend(), "off");
});

test("the scanner does not queue a safe-arrival note without consent", () => {
  const facts = {
    now,
    attendance: [
      {
        id: "a1",
        daycareId: "d1",
        name: "Oaks",
        dropOff: "08:00",
        pickUp: "16:00",
        checkedIn: false,
        checkedOut: false,
        staffUserIds: ["staff"],
        timeZone: "UTC",
        consent: false,
        parentNotified: false,
        day: "2026-11-09",
      },
    ],
  };
  assert.equal(planUnifiedScan(facts).some((row) => row.typeId === "staff_child_not_arrived"), false);
  const allowed = planUnifiedScan({
    ...facts,
    attendance: [{ ...facts.attendance[0], consent: true }],
  });
  assert.equal(allowed.some((row) => row.typeId === "staff_child_not_arrived"), true);
});

test("safe arrival is recorded in the app and is not sent", () => {
  const settings = {
    master: true,
    inApp: true,
    email: true,
    push: true,
    digest: "off",
    quietStart: "21:00",
    quietEnd: "08:00",
    timeZone: "UTC",
    quietCustom: true,
  };
  const decision = decideUnifiedAlert({
    typeId: "staff_child_not_arrived",
    settings,
    typeEnabled: true,
    flagOn: true,
    live: true,
    pushArmed: true,
    previewOrTest: false,
    blocked: false,
  });
  assert.equal(decision.action, "record");
  assert.equal(decision.outbound, "none");
  assert.equal(decision.channels.includes("email"), false);
  assert.equal(decision.channels.includes("push"), false);
  const source = readFileSync(new URL("../src/lib/safe-arrival.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(|sendMail|sendSms/);
});
