import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { leadDedupeKey } from "../src/lib/centre-crm.ts";
import {
  ENTRY_GAP,
  KIDEASE_BUSINESS_EVENTS,
  LEAD_ENTRY_POINTS,
  entryForLeadKind,
  mergeLeadIntake,
  planLeadIntake,
} from "../src/lib/lead-intake.ts";
import { createOrUpdateLead } from "../src/lib/server/lead-intake-write.ts";

const family = { daycareId: "centre-1", parentUserId: "parent-1", email: "parent@example.com" };

const EXPECTED = {
  listing_inquiry: ["inquiry", "inquiry"],
  contact_form: ["inquiry", "inquiry"],
  enrol_now: ["application", "applied"],
  assisted_enrol: ["application", "applied"],
  tour_request: ["tour", "tour_booked"],
  tour_booking: ["tour", "tour_booked"],
  tour_completed: ["tour", "toured"],
  waitlist_join: ["waitlist", "waitlisted"],
  area_waitlist: ["waitlist", "waitlisted"],
  spot_alert: ["waitlist", "waitlisted"],
  application: ["application", "applied"],
  family_application: ["application", "applied"],
  saved_share: ["inquiry", "inquiry"],
  listing_message: ["inquiry", "inquiry"],
  claim_inquiry: ["inquiry", "inquiry"],
  future_opening: ["inquiry", "inquiry"],
  schedule_match: ["inquiry", "inquiry"],
  lead_inbox: ["inquiry", "inquiry"],
  requests: ["inquiry", "inquiry"],
  tracker_record: ["inquiry", "inquiry"],
  manual_add: ["manual", "inquiry"],
  booking_accepted: ["enrolment", "enrolled"],
  spot_offer: ["offer", "offered"],
};

for (const entry of LEAD_ENTRY_POINTS) {
  test(`${entry} lands with the right source and stage`, () => {
    const [source, stage] = EXPECTED[entry];
    const plan = planLeadIntake({
      ...family,
      entry,
      shareOptIn: true,
      childLabel: "Noah",
      ageGroup: "toddler",
      desiredStart: "2026-09",
      schedule: "full",
      firstTouchAt: "2026-01-02T00:00:00.000Z",
    });
    assert.equal(plan.wired, true);
    if (!plan.wired) return;
    assert.equal(plan.source, source);
    assert.equal(plan.stage, stage);
    assert.equal(plan.childLabel, "Noah");
    assert.equal(plan.ageGroup, "toddler");
    assert.equal(plan.desiredStart, "2026-09");
    assert.equal(plan.schedule, "full");
    assert.equal(plan.firstTouchAt, "2026-01-02T00:00:00.000Z");
  });
}

test("a later action from the same family updates one lead", () => {
  const key = leadDedupeKey(family);
  assert.equal(leadDedupeKey({ daycareId: "centre-1", parentUserId: "parent-1" }), key);
  assert.notEqual(leadDedupeKey({ daycareId: "centre-2", parentUserId: "parent-1" }), key);
  const first = planLeadIntake({ ...family, entry: "listing_inquiry", firstTouchAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(first.wired, true);
  if (!first.wired) return;
  const opened = mergeLeadIntake(null, first, "2026-01-01T00:00:00.000Z");
  assert.equal(opened.created, true);
  assert.equal(opened.stage, "inquiry");
  const tour = planLeadIntake({ ...family, entry: "tour_request", firstTouchAt: "2026-02-01T00:00:00.000Z" });
  if (!tour.wired) return;
  const booked = mergeLeadIntake(
    { stage: opened.stage, source: opened.source, startedAt: opened.startedAt },
    tour,
    "2026-02-01T00:00:00.000Z",
  );
  assert.equal(booked.created, false);
  assert.equal(booked.stage, "tour_booked");
  assert.equal(booked.source, "inquiry");
  assert.equal(booked.startedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(booked.timeline, true);
  const again = planLeadIntake({ ...family, entry: "listing_inquiry", firstTouchAt: "2026-03-01T00:00:00.000Z" });
  if (!again.wired) return;
  const held = mergeLeadIntake(
    { stage: booked.stage, source: booked.source, startedAt: booked.startedAt },
    again,
    "2026-03-01T00:00:00.000Z",
  );
  assert.equal(held.stage, "tour_booked");
});

test("the same email is one lead when the parent is a guest", () => {
  const guest = planLeadIntake({
    entry: "contact_form",
    daycareId: "centre-1",
    parentUserId: "guest:parent@example.com",
  });
  assert.equal(guest.wired, true);
  if (!guest.wired) return;
  assert.equal(guest.parentUserId, null);
  assert.equal(guest.email, "parent@example.com");
  assert.equal(
    leadDedupeKey({ daycareId: guest.daycareId, email: guest.email }),
    "centre-1:email:parent@example.com",
  );
});

test("a save is a lead only when the parent opted to share", () => {
  const hidden = planLeadIntake({ ...family, entry: "saved_share", shareOptIn: false });
  assert.equal(hidden.wired, false);
  const shared = planLeadIntake({ ...family, entry: "saved_share", shareOptIn: true });
  assert.equal(shared.wired, true);
});

test("an area waitlist or spot alert needs a centre", () => {
  assert.equal(planLeadIntake({ entry: "area_waitlist", parentUserId: "parent-1" }).wired, false);
  assert.equal(planLeadIntake({ entry: "spot_alert", parentUserId: "parent-1" }).wired, false);
  assert.equal(ENTRY_GAP.area_waitlist?.includes("no centre"), true);
  assert.equal(ENTRY_GAP.saved_share?.includes("share"), true);
  assert.equal(ENTRY_GAP.future_opening?.includes("No future-opening"), true);
  assert.equal(ENTRY_GAP.schedule_match?.includes("No schedule-match"), true);
});

test("lead kinds map onto the pipeline entries", () => {
  assert.equal(entryForLeadKind("tour"), "tour_request");
  assert.equal(entryForLeadKind("tour", "tour_booking"), "tour_booking");
  assert.equal(entryForLeadKind("waitlist"), "waitlist_join");
  assert.equal(entryForLeadKind("spot_inquiry"), "application");
  assert.equal(entryForLeadKind("info"), "listing_inquiry");
});

test("a listing claim and a provider signup never create a centre lead", async () => {
  for (const entry of KIDEASE_BUSINESS_EVENTS) {
    const plan = planLeadIntake({ entry, daycareId: "centre-1", parentUserId: "owner-1", email: "owner@day.ca" });
    assert.equal(plan.wired, false);
    if (!plan.wired) assert.equal(plan.reason, "kidease_business_lead");
    let wrote = false;
    const sql = async () => {
      wrote = true;
      return [];
    };
    const result = await createOrUpdateLead(sql, { entry, daycareId: "centre-1", parentUserId: "owner-1", email: "owner@day.ca" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "kidease_business_lead");
    assert.equal(wrote, false);
  }
  const family = planLeadIntake({ entry: "listing_inquiry", daycareId: "centre-1", parentUserId: "parent-1" });
  assert.equal(family.wired, true);
});

test("claim and provider signup code does not write a centre lead", () => {
  const claims = readFileSync(new URL("../src/lib/server/claims.ts", import.meta.url), "utf8");
  assert.equal(claims.includes("createOrUpdateLead"), false);
  assert.equal(claims.includes("rememberCentreLead"), false);
  const family = readFileSync(new URL("../src/lib/server/family.ts", import.meta.url), "utf8");
  const intake = family.slice(family.indexOf("export async function ensureCrmIntake"), family.indexOf("export const getFamily"));
  assert.equal(intake.includes("createOrUpdateLead"), false);
  assert.equal(intake.includes("rememberCentreLead"), false);
  const ghl = readFileSync(new URL("../src/lib/server/ghl-intake.ts", import.meta.url), "utf8");
  assert.equal(ghl.includes("createOrUpdateLead"), false);
  assert.equal(ghl.includes("rememberCentreLead"), false);
});

test("a locked stage stays put", () => {
  const plan = planLeadIntake({ ...family, entry: "booking_accepted" });
  if (!plan.wired) return;
  const merged = mergeLeadIntake(
    { stage: "tour_booked", source: "tour", startedAt: "2026-01-01T00:00:00.000Z", stageLocked: true },
    plan,
    "2026-04-01T00:00:00.000Z",
  );
  assert.equal(merged.stage, "tour_booked");
  assert.equal(merged.timeline, true);
});
