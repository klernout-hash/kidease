import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  applyAbsence,
  canSeeImmunization,
  copyEndorsesCentre,
  eventSend,
  eventZoneLabel,
  forecastVisible,
  healthScore,
  immunizationStatus,
  immunizationViewAudit,
  miniSiteOpen,
  parentCanRsvp,
  publishForecast,
  reofferSpot,
  roomForecast,
  rsvpHeadcount,
  staffSeesAbsence,
} from "../src/lib/phase5-rules.ts";

test("phase 5 flags stay off and an absence does not free the spot", () => {
  for (const key of ["FEATURE_PARENT_ABSENCE", "FEATURE_EVENT_RSVP", "FEATURE_IMMUNIZATION_FILE", "FEATURE_CENTRE_MINISITE", "FEATURE_ROOM_FORECAST"]) {
    assert.equal(FLAG_DEFAULTS[key], false, key);
  }
  const rows = applyAbsence(
    [{ childId: "c1", day: "2026-11-12", status: "expected" }, { childId: "c2", day: "2026-11-12", status: "expected" }],
    { childId: "c1", from: "2026-11-12", to: "2026-11-12", reason: "Fever" },
  );
  assert.equal(rows.find((row) => row.childId === "c1")?.status, "absent");
  assert.equal(rows.find((row) => row.childId === "c2")?.status, "expected");
  assert.equal(reofferSpot(), false);
  assert.equal(staffSeesAbsence("billing"), false);
  assert.equal(staffSeesAbsence("staff"), true);
  assert.equal(staffSeesAbsence("parent"), false);
});

test("events stay in the centre zone and RSVP does not send", () => {
  assert.match(eventZoneLabel("2026-11-09T14:12:00.000Z", "America/Winnipeg"), /CST/);
  assert.match(eventZoneLabel("2026-07-15T18:00:00.000Z", "America/Winnipeg"), /CDT/);
  assert.equal(parentCanRsvp({ role: "billing", audience: "centre", roomId: null, parentRoomId: null }), false);
  assert.equal(parentCanRsvp({ role: "parent", audience: "room", roomId: "r1", parentRoomId: "r2" }), false);
  assert.equal(parentCanRsvp({ role: "parent", audience: "centre", roomId: null, parentRoomId: null }), true);
  assert.equal(rsvpHeadcount("yes", 0), null);
  assert.equal(rsvpHeadcount("no", 4), 0);
  assert.equal(eventSend().deliver, false);
});

test("immunization files stay with the owner and that centre's staff", () => {
  assert.equal(immunizationStatus({ hasFile: false, expiresOn: null, now: new Date("2026-11-11") }), "missing");
  assert.equal(immunizationStatus({ hasFile: true, expiresOn: "2026-01-01", now: new Date("2026-11-11") }), "expired");
  assert.equal(immunizationStatus({ hasFile: true, expiresOn: "2027-01-01", now: new Date("2026-11-11") }), "on_file");
  assert.equal(canSeeImmunization({ role: "parent", ownerId: "p1", viewerId: "p2", centreStaff: false }), false);
  assert.equal(canSeeImmunization({ role: "billing", ownerId: "p1", viewerId: "b1", centreStaff: true }), false);
  assert.equal(canSeeImmunization({ role: "public", ownerId: "p1", viewerId: "x", centreStaff: false }), false);
  assert.equal(canSeeImmunization({ role: "parent", ownerId: "p1", viewerId: "p1", centreStaff: false }), true);
  assert.equal(canSeeImmunization({ role: "staff", ownerId: "p1", viewerId: "s1", centreStaff: true }), true);
  assert.equal(canSeeImmunization({ role: "staff", ownerId: "p1", viewerId: "s1", centreStaff: false }), false);
  assert.equal(immunizationViewAudit({ childId: "c1", viewerId: "s1", at: "2026-11-11T00:00:00.000Z" })?.action, "view");
  assert.equal(healthScore(), null);
});

test("a mini-site is only for a claimed centre and the forecast stays inside the desk", () => {
  assert.equal(miniSiteOpen({ claimed: false, slug: "oaks" }), false);
  assert.equal(miniSiteOpen({ claimed: true, slug: "oaks" }), true);
  assert.equal(copyEndorsesCentre("Certified by KidEase"), true);
  assert.equal(copyEndorsesCentre("Hours and fees the centre saved."), false);
  const rows = roomForecast({
    today: "2026-11-01",
    rooms: [{ id: "toddler", minMonths: 18, maxMonths: 30 }],
    children: [{ id: "ada", birth: "2024-04-01", roomId: "toddler" }],
    waitlist: [{ childId: "bee", start: "2026-12-01", ageMonths: 20 }],
  });
  assert.ok(rows.every((row) => row.estimate === true));
  assert.ok(rows.some((row) => row.why.includes("Waitlist")));
  assert.equal(forecastVisible("parent"), false);
  assert.equal(forecastVisible("billing"), false);
  assert.equal(forecastVisible("owner"), true);
  assert.equal(publishForecast(), false);
});
