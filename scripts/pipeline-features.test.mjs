import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  WAITLIST_EVENT,
  checkTypedSignature,
  countdownLabel,
  earliestPreferredStart,
  offerCountdown,
  orderFromIds,
  signedAgreementHtml,
  staffChildTags,
  tourOutcomeCounts,
  tourVisitPast,
  waitlistJoinDecision,
  waitlistOpenFromEvents,
  withdrawalCancelable,
  cleanReason,
} from "../src/lib/pipeline-features.ts";
import {
  expireDue,
  fairOfferOrder,
  offerNextForAge,
  respondToOffer,
  SPOT_OFFER_WINDOW_MS,
} from "../src/lib/spot-offers.ts";
import { pipelineCopy } from "../src/lib/pipeline-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const now = Date.parse("2026-11-25T18:00:00.000Z");
let seq = 0;
const nextId = () => `so_${++seq}`;

function entry(id, extra = {}) {
  return {
    id,
    daycareId: "dc1",
    userId: `u_${id}`,
    ageGroup: "toddler",
    status: "waiting",
    joinedAt: `2026-11-0${extra.day ?? 1}T00:00:00.000Z`,
    ...extra,
  };
}

test("waitlist is open by default and the owner's latest choice wins", () => {
  assert.equal(waitlistOpenFromEvents([]), true);
  const closed = [{ action: WAITLIST_EVENT.closed, createdAt: "2026-11-20T00:00:00.000Z" }];
  assert.equal(waitlistOpenFromEvents(closed), false);
  assert.equal(
    waitlistOpenFromEvents([
      ...closed,
      { action: WAITLIST_EVENT.opened, createdAt: "2026-11-21T00:00:00.000Z" },
    ]),
    true,
  );
  assert.equal(
    waitlistOpenFromEvents([
      { action: "export", createdAt: "2026-11-22T00:00:00.000Z" },
      ...closed,
    ]),
    false,
  );
});

test("join rule: public listings open, QA fixture only for test accounts, owner can close", () => {
  const base = {
    publicListing: true,
    hiddenTestListing: false,
    viewerIsTestAccount: false,
    ownerOpen: true,
  };
  assert.deepEqual(waitlistJoinDecision(base), { ok: true });
  assert.deepEqual(waitlistJoinDecision({ ...base, ownerOpen: false }), {
    ok: false,
    reason: "closed",
  });
  assert.deepEqual(waitlistJoinDecision({ ...base, publicListing: false }), {
    ok: false,
    reason: "not_open",
  });
  assert.deepEqual(
    waitlistJoinDecision({
      ...base,
      publicListing: false,
      hiddenTestListing: true,
      viewerIsTestAccount: true,
    }),
    { ok: true },
  );
  assert.deepEqual(
    waitlistJoinDecision({
      ...base,
      publicListing: false,
      hiddenTestListing: true,
      viewerIsTestAccount: false,
    }),
    { ok: false, reason: "not_open" },
  );
});

test("staff-child tags use the newest event per family", () => {
  const tags = staffChildTags([
    { action: WAITLIST_EVENT.staffOn, entryId: "a", createdAt: "2026-11-01T00:00:00Z" },
    { action: WAITLIST_EVENT.staffOff, entryId: "a", createdAt: "2026-11-02T00:00:00Z" },
    { action: WAITLIST_EVENT.staffOn, entryId: "b", createdAt: "2026-11-03T00:00:00Z" },
  ]);
  assert.equal(tags.has("a"), false);
  assert.equal(tags.has("b"), true);
});

test("saved order drops unknown and repeated ids", () => {
  assert.deepEqual(orderFromIds(["b", "x", "a", "b"], new Set(["a", "b"])), [
    { id: "b", rank: 1 },
    { id: "a", rank: 2 },
  ]);
});

test("offer order: staff child, then sibling rule, then saved order, then sign-up date", () => {
  const rows = [
    entry("a", { day: 1 }),
    entry("b", { day: 2, rank: 1 }),
    entry("c", { day: 3, sibling: true }),
    entry("d", { day: 4, staffChild: true }),
  ];
  assert.deepEqual(
    fairOfferOrder(rows, { siblingPriority: false, spotAge: "toddler" }).map((row) => row.id),
    ["d", "b", "a", "c"],
  );
  assert.deepEqual(
    fairOfferOrder(rows, { siblingPriority: true, spotAge: "toddler" }).map((row) => row.id),
    ["d", "c", "b", "a"],
  );
});

test("offer to next family by age, then decline and expiry move to the next family", () => {
  const state = {
    entries: [
      entry("inf", { ageGroup: "infant" }),
      entry("t1", { day: 2 }),
      entry("t2", { day: 3 }),
    ],
    offers: [],
    siblingPriority: false,
  };
  const first = offerNextForAge(state, "dc1", "toddler", now, nextId);
  assert.equal(first.ok, true);
  assert.equal(first.createdOffers[0].waitlistId, "t1");
  assert.equal(Date.parse(first.createdOffers[0].expiresAt) - now, SPOT_OFFER_WINDOW_MS);
  const blocked = offerNextForAge(first.state, "dc1", "toddler", now, nextId);
  assert.equal(blocked.ok, false);
  const declined = respondToOffer(
    first.state,
    first.createdOffers[0].id,
    "decline",
    now + 1000,
    nextId,
  );
  assert.equal(declined.createdOffers[0].waitlistId, "t2");
  const expired = expireDue(declined.state, now + SPOT_OFFER_WINDOW_MS + 5000, nextId);
  assert.equal(expired.state.entries.find((row) => row.id === "t2").status, "expired");
  const none = offerNextForAge(
    { entries: [entry("inf", { ageGroup: "infant" })], offers: [] },
    "dc1",
    "preschool",
    now,
    nextId,
  );
  assert.equal(none.ok, false);
});

test("countdown and labels in EN and FR", () => {
  const count = offerCountdown(new Date(now + 47 * 3600_000 + 5 * 60_000).toISOString(), now);
  assert.equal(count.hours, 47);
  assert.equal(count.minutes, 5);
  assert.match(countdownLabel(count, "en"), /47 h 5 min left/);
  assert.match(countdownLabel(count, "fr"), /47 h 05 min pour répondre/);
  assert.equal(offerCountdown(new Date(now - 1).toISOString(), now).expired, true);
  assert.equal(countdownLabel(offerCountdown(null, now), "en"), "Offer ended");
});

test("tour outcomes count attended and no-show, and no-show opens after the visit day", () => {
  assert.deepEqual(tourOutcomeCounts(["completed", "enrolled", "no_show", "accepted", null]), {
    attended: 2,
    noShow: 1,
    past: 3,
    noShowRate: 33,
  });
  assert.equal(tourOutcomeCounts([]).noShowRate, null);
  const times = JSON.stringify([
    { date: "2026-12-02", time: "10:00" },
    { date: "2026-11-20", time: "09:30" },
  ]);
  assert.equal(earliestPreferredStart(times), "2026-11-20T09:30");
  assert.equal(tourVisitPast(times, now), true);
  assert.equal(tourVisitPast([{ date: "2026-12-30", time: "10:00" }], now), false);
});

test("typed signature must match the parent's name and the box must be ticked", () => {
  assert.deepEqual(
    checkTypedSignature({ typedName: "Jonny Doey", expectedName: "Jonny Doey", agreed: false }),
    { ok: false, error: "agree" },
  );
  assert.deepEqual(
    checkTypedSignature({ typedName: "Someone Else", expectedName: "Jonny Doey", agreed: true }),
    { ok: false, error: "name" },
  );
  assert.deepEqual(
    checkTypedSignature({ typedName: " jonny  doey ", expectedName: "Jonny Doey", agreed: true }),
    { ok: true, name: "jonny doey" },
  );
  assert.deepEqual(
    checkTypedSignature({ typedName: "Amélie Côté", expectedName: "Amelie Cote", agreed: true }).ok,
    true,
  );
  const html = signedAgreementHtml({
    title: "Enrolment <x>",
    bodyHtml: "<p>Terms</p>",
    signatures: [{ role: "parent", name: "<script>", at: "2026-11-25T18:00:00.000Z" }],
  });
  assert.match(html, /Signatures \/ Signatures/);
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
});

test("withdrawal notice can be cancelled until the last day", () => {
  assert.equal(withdrawalCancelable("2026-12-01", "2026-11-25"), true);
  assert.equal(withdrawalCancelable("2026-11-25", "2026-11-25"), true);
  assert.equal(withdrawalCancelable("2026-11-24", "2026-11-25"), false);
  assert.equal(withdrawalCancelable("bad", "2026-11-25"), false);
  assert.equal(cleanReason("  moving   to\nBrandon ").length <= 280, true);
  assert.equal(cleanReason("x".repeat(400)).length, 280);
});

test("EN and FR copy have the same keys and Canadian wording", () => {
  const en = pipelineCopy("en");
  const fr = pipelineCopy("fr");
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  assert.doesNotMatch(JSON.stringify(en), /\b(zip|state|daycare center|enrollment)\b/i);
});

test("wiring: waitlist rule, owner tools, offers, sync, agreement, withdrawal, and bell are connected", () => {
  const server = read("src/lib/server/spot-offers.ts");
  assert.match(server, /waitlistJoinDecision/);
  assert.match(server, /export const offerSpotToNextFamily/);
  assert.match(server, /export const saveWaitlistOrder/);
  assert.match(server, /export const tagWaitlistFamily/);
  assert.match(server, /export const setCentreWaitlistOpen/);
  assert.doesNotMatch(
    server,
    /if \(!waitlistToolsEnabled\(\)\) return \{ ok: false as const, reason: "off"/,
  );
  const desk = read("src/components/spot-offer-desk.tsx");
  assert.match(desk, /offerSpotToNextFamily/);
  assert.match(desk, /draggable/);
  assert.match(desk, /open-offer-countdown/);
  assert.match(read("src/components/my-spot-offers.tsx"), /parent-offer-countdown/);
  assert.match(read("src/lib/server/family.ts"), /syncBookingLeadStatus/);
  assert.match(read("src/lib/server/lead-requests.ts"), /applyLeadDecisionToBooking/);
  assert.match(read("src/lib/server/parent-agreement.ts"), /const inApp = !docusignConfig\(\)/);
  assert.match(
    read("src/lib/server/agreement-sign.ts"),
    /claimRequestStatusTransition\(sql, row\.booking_id, "active"\)/,
  );
  assert.match(read("src/lib/server/wiring/withdrawal.ts"), /export const cancelWithdrawal/);
  assert.match(read("src/lib/server/notifications.ts"), /projectFromPipeline/);
  assert.match(read("src/components/centre-pipeline.tsx"), /TourOutcomeSummary/);
  // No new migration in this change.
  assert.doesNotMatch(read("src/lib/server/agreement-sign.ts"), /alter table|create table/i);
});
