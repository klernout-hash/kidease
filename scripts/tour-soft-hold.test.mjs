import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TOUR_HOLD_SLA_HOURS,
  TOUR_HOLD_SLA_MIN_HOURS,
  canCancelTour,
  canProposeTourTime,
  declineReasonValid,
  isSoftHoldExpired,
  isTourSeatHoldStatus,
  tourHoldRemainingMs,
  tourInventoryState,
} from "../src/lib/tour-hold.ts";
import { toPublicTourSlot } from "../src/lib/tour-calendar.ts";
import { collectPendingTourRows, TODAY_TOUR_SLA_HOURS } from "../src/lib/today-sla.ts";
import { nextTourStatus, tourRescheduleBody, tourStatusBody } from "../src/lib/threads.ts";
import { tourStatusToLead } from "../src/lib/lead-requests.ts";
import { tourToPipelineStage } from "../src/lib/tour-pipeline.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const now = Date.parse("2026-09-13T15:00:00.000Z");

test("inventory is Open / Soft-hold / Confirmed / Blocked from real seats", () => {
  assert.equal(tourInventoryState({ remaining: 2, pending: 0, accepted: 0, bookable: true }), "open");
  assert.equal(tourInventoryState({ remaining: 1, pending: 1, accepted: 0, bookable: true }), "soft_hold");
  assert.equal(tourInventoryState({ remaining: 0, pending: 0, accepted: 1, bookable: true }), "confirmed");
  assert.equal(tourInventoryState({ remaining: 0, pending: 1, accepted: 0, bookable: true }), "soft_hold");
  assert.equal(tourInventoryState({ remaining: 1, pending: 0, accepted: 0, bookable: false }), "blocked");
  assert.equal(TOUR_HOLD_SLA_MIN_HOURS, 24);
  assert.equal(TOUR_HOLD_SLA_HOURS, 48);
  assert.equal(TODAY_TOUR_SLA_HOURS, 48);
});

test("parent book is a 48h soft-hold; expired holds free the seat", () => {
  const created = new Date(now - 47 * 60 * 60 * 1000).toISOString();
  const remaining = tourHoldRemainingMs({ createdAt: created }, now);
  assert.ok(remaining != null && remaining > 0);
  assert.equal(isSoftHoldExpired({ status: "pending", createdAt: created, now }), false);
  assert.equal(
    isSoftHoldExpired({ status: "pending", createdAt: new Date(now - 49 * 60 * 60 * 1000).toISOString(), now }),
    true,
  );
  assert.equal(isTourSeatHoldStatus("pending"), true);
  assert.equal(isTourSeatHoldStatus("accepted"), true);
  assert.equal(isTourSeatHoldStatus("expired"), false);
  assert.equal(isTourSeatHoldStatus("declined"), false);
  assert.equal(tourToPipelineStage("expired"), "lost");
  assert.equal(tourStatusToLead("expired"), "declined");
});

test("provider Accept / Propose / Decline + cancel stay honest", () => {
  assert.equal(nextTourStatus("pending", "accepted"), "accepted");
  assert.equal(nextTourStatus("pending", "declined"), "declined");
  assert.equal(nextTourStatus("pending", "expired"), "expired");
  assert.equal(canProposeTourTime("pending"), true);
  assert.equal(canProposeTourTime("accepted"), true);
  assert.equal(canProposeTourTime("declined"), false);
  assert.equal(canCancelTour("accepted"), true);
  assert.equal(declineReasonValid(""), false);
  assert.equal(declineReasonValid("no"), true);
  const proposed = tourRescheduleBody({
    daycareName: "Bonnie",
    times: [{ date: "2026-09-20", time: "10:00" }],
  });
  assert.match(proposed, /Bonnie/);
  assert.match(proposed, /new tour time/i);
  const expired = tourStatusBody({ status: "expired", daycareName: "Bonnie" });
  assert.match(expired, /expired/i);
});

test("Today SLA cards deep-link to the thread tour and hide notes", () => {
  const created = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const rows = collectPendingTourRows(
    [
      {
        id: "t1",
        conversationId: "c1",
        daycareId: "d1",
        daycareName: "Bonnie",
        daycareSlug: "bonnie",
        childId: null,
        childName: null,
        parentName: "Alex",
        preferredTimes: [{ date: "2026-09-20", time: "10:00" }],
        parentNote: "peanut allergy secret",
        status: "pending",
        centreNote: null,
        createdAt: created,
        respondedAt: null,
        holdExpiresAt: new Date(now + 46 * 60 * 60 * 1000).toISOString(),
      },
    ],
    "Parent",
    now,
  );
  assert.equal(rows[0]?.kind, "tour_request");
  assert.equal(rows[0]?.canDecide, true);
  assert.deepEqual(rows[0]?.href, {
    to: "/inbox/$id",
    params: { id: "c1" },
    search: { view: "centre", tour: "t1" },
  });
  assert.doesNotMatch(JSON.stringify(rows), /peanut allergy/);
});

test("posted slots carry inventory and public book is not Instant Book placement", () => {
  const open = toPublicTourSlot({
    id: "tw_open",
    date: "2026-12-01",
    startTime: "14:00",
    endTime: "14:30",
    capacity: 2,
    pending: 0,
    accepted: 0,
    timezone: "America/Winnipeg",
    now: new Date("2026-09-13T18:00:00Z"),
  });
  const hold = toPublicTourSlot({
    id: "tw_hold",
    date: "2026-12-01",
    startTime: "10:00",
    endTime: "10:30",
    capacity: 1,
    pending: 1,
    accepted: 0,
    timezone: "America/Winnipeg",
    now: new Date("2026-09-13T18:00:00Z"),
  });
  assert.equal(open?.inventory, "open");
  assert.equal(hold?.inventory, "soft_hold");
  assert.equal(hold?.remaining, 0);
});

test("EN and FR copy keys exist for inventory and decline reason", () => {
  const text = src("src/lib/copy.ts");
  for (const key of [
    "tourInventoryOpen",
    "tourInventorySoftHold",
    "tourInventoryConfirmed",
    "tourInventoryBlocked",
    "tourDeclineReason",
    "tourHoldSlaLead",
    "cancelTour",
  ]) {
    const hits = text.match(new RegExp(`${key}:`, "g")) || [];
    assert.ok(hits.length >= 2, `${key} must exist in EN and FR`);
  }
});

test("migration and wiring: hold expiry, Accept/Propose/Decline, both-side notify, no Instant Book", () => {
  const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql"));
  assert.ok(files.includes("0049_tour_soft_hold.sql"));
  const mig = src("migrations/0049_tour_soft_hold.sql");
  assert.match(mig, /hold_expires_at/);
  assert.match(mig, /expired/);
  assert.match(mig, /Not Instant Book/);

  const server = src("src/lib/server/tours.ts");
  assert.match(server, /export const proposeTourTime/);
  assert.match(server, /export const cancelTourRequest/);
  assert.match(server, /declineReasonValid/);
  assert.match(server, /notifyTourParties/);
  assert.match(server, /holdExpiresAtIso/);

  const book = src("src/lib/server/tour-calendar.ts");
  assert.match(book, /holdExpiresAtIso/);
  assert.doesNotMatch(book, /instant book|instantBook/i);

  const card = src("src/components/tour-card.tsx");
  assert.match(card, /proposeTourTime/);
  assert.match(card, /acceptTour/);
  assert.match(card, /declineTour/);
  assert.match(card, /todayProposeTime/);

  const today = src("src/components/today-urgency-home.tsx");
  assert.match(today, /tourDeclineReason/);
  assert.match(today, /todayProposeTime/);
  assert.match(today, /declineTour/);

  const inbox = src("src/routes/inbox.\$id.tsx");
  assert.match(inbox, /search\.tour/);
  assert.match(inbox, /tour-\$\{tourId\}/);

  const job = src("src/lib/server/tour-holds.ts");
  assert.match(job, /status = \$\{"expired"\}/);
  assert.match(job, /notifyTourParties/);

  const cron = src("src/routes/api/tour-holds.ts");
  assert.match(cron, /cronAuthorized/);
  assert.match(cron, /runExpireTourHoldsJob/);
  assert.match(src("vercel.json"), /\/api\/tour-holds/);
  assert.match(src("src/inngest/functions.ts"), /tour-holds-hourly/);
  assert.doesNotMatch(src("src/lib/tour-hold.ts"), /Instant Book childcare placement/i);
});
