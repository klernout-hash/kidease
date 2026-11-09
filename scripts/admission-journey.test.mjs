import assert from "node:assert/strict";
import { test } from "node:test";
import { admissionJourney } from "../src/lib/admission-journey.ts";

test("a decline stays a decline and a waitlist has no queue number", () => {
  assert.equal(admissionJourney({ tourStatus: "pending" }).step, "asked");
  assert.equal(admissionJourney({ tourStatus: "accepted" }).step, "visit_booked");
  assert.equal(admissionJourney({ tourStatus: "declined" }).step, "visit_declined");
  const waiting = admissionJourney({ bookingStatus: "waitlist", queuePosition: 4 });
  assert.equal(waiting.step, "waitlist");
  assert.equal(waiting.queuePosition, null);
  assert.equal(admissionJourney({ offerStatus: "pending" }).step, "offer");
  assert.equal(admissionJourney({ offerStatus: "declined" }).step, "offer_declined");
  assert.equal(admissionJourney({ offerStatus: "accepted" }).step, "enrolled");
  assert.equal(admissionJourney({ bookingStatus: "active" }).step, "enrolled");
});

test("another family's facts are not inferred", () => {
  const step = admissionJourney({});
  assert.equal(step.step, "asked");
  assert.equal(step.queuePosition, null);
  assert.equal(typeof step.copyKey, "string");
});
