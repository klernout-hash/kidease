import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  centreWallClock,
  planTourConfirmation,
  planTourFollowup,
  resolveTourCentre,
  tourConfirmIcs,
  tourConfirmKey,
  tourNextStepLetter,
} from "../src/lib/tour-phase0.ts";

test("tour confirmation is held once and never sent from this module", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_TOUR_PIPELINE, false);
  const key = tourConfirmKey("tour-1", "booked", 1);
  assert.equal(key, "tour-1:booked:1");
  const early = planTourConfirmation({
    flagOn: true,
    tourId: "tour-1",
    event: "booked",
    version: 1,
    occurredAt: "2026-01-01T15:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
    alreadyHeld: false,
    locale: "fr",
  });
  assert.equal(early.reason, "pre_enable");
  assert.equal(early.deliver, false);
  const held = planTourConfirmation({
    flagOn: true,
    tourId: "tour-1",
    event: "booked",
    version: 1,
    occurredAt: "2026-11-11T15:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
    alreadyHeld: false,
  });
  assert.equal(held.reason, "held");
  assert.equal(held.deliver, false);
  assert.equal(held.event, "tour_confirmation_sent");
  const again = planTourConfirmation({
    flagOn: true,
    tourId: "tour-1",
    event: "booked",
    version: 1,
    occurredAt: "2026-11-11T15:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
    alreadyHeld: true,
  });
  assert.equal(again.reason, "duplicate");
  const off = planTourConfirmation({
    flagOn: false,
    tourId: "tour-1",
    event: "booked",
    version: 1,
    occurredAt: "2026-11-11T15:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
    alreadyHeld: false,
  });
  assert.equal(off.reason, "flag_off");
});

test("the calendar file keeps the centre's local time", () => {
  const start = new Date("2026-11-01T13:30:00.000Z");
  const end = new Date("2026-11-01T14:00:00.000Z");
  const wall = centreWallClock(start, "America/Winnipeg");
  const ics = tourConfirmIcs({
    tourId: "tour-1",
    title: "Tour",
    start,
    end,
    timeZone: "America/Winnipeg",
    location: "1 Main St",
    description: "Tour",
  });
  assert.match(ics, new RegExp(`DTSTART;TZID=America/Winnipeg:${wall}`));
  assert.match(ics, /UID:tour-1@kidease\.ca/);
  assert.notEqual(wall, "20261101T133000");
});

test("a centre id you do not belong to is rejected", () => {
  assert.deepEqual(resolveTourCentre({ selectedId: "", memberships: ["centre-a"] }), {
    ok: false,
    status: 403,
    reason: "missing",
  });
  assert.deepEqual(resolveTourCentre({ selectedId: "centre-b", memberships: ["centre-a"] }), {
    ok: false,
    status: 403,
    reason: "not_a_member",
  });
  assert.deepEqual(resolveTourCentre({ selectedId: "centre-a", memberships: ["centre-b", "centre-a"] }), {
    ok: true,
    centreId: "centre-a",
  });
  assert.equal(resolveTourCentre({ selectedId: null, memberships: ["centre-a"] }).ok, false);
});

test("the post-tour note sends once, skips old tours, and waits out quiet hours", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_POST_TOUR_FOLLOWUP, false);
  const base = {
    flagOn: true,
    tourAt: "2026-11-09T15:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
    now: new Date("2026-11-10T18:00:00.000Z"),
    timeZone: "America/Winnipeg",
    cancelled: false,
    applied: false,
    waitlisted: false,
    alreadySent: false,
  };
  assert.equal(planTourFollowup({ ...base, flagOn: false }).reason, "flag_off");
  assert.equal(planTourFollowup({ ...base, enabledAt: null }).reason, "enable_time_unset");
  assert.equal(planTourFollowup({ ...base, tourAt: "2026-10-01T15:00:00.000Z" }).reason, "pre_enable");
  assert.equal(planTourFollowup({ ...base, applied: true }).reason, "applied");
  assert.equal(planTourFollowup({ ...base, waitlisted: true }).reason, "waitlist");
  assert.equal(planTourFollowup({ ...base, alreadySent: true }).reason, "duplicate");
  assert.equal(planTourFollowup({ ...base, now: new Date("2026-11-11T04:00:00.000Z") }).reason, "quiet");
  const ready = planTourFollowup(base);
  assert.equal(ready.send, true);
  assert.equal(ready.event, "tour_followup_sent");
  const fr = tourNextStepLetter({ locale: "fr", centre: "Nord", applyPath: "/fr/search" });
  assert.match(fr.subject, /Nord/);
  assert.match(fr.text, /n’est pas une offre/);
  assert.doesNotMatch(fr.text, /gratuit pour toujours/i);
});
