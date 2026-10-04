import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { spotOfferMailEnabled } from "../src/lib/features.ts";
import { spotOfferCopy } from "../src/lib/spot-offer-copy.ts";
import {
  SPOT_OFFER_WINDOW_MS,
  WAITLIST_FEE_FORBIDDEN,
  expireDue,
  offerExpiresAt,
  placeInLine,
  rejectWaitlistFee,
  respondToOffer,
  sendSpotToFamily,
  spotOfferMailPlan,
  waitlistIncludedOnEveryPlan,
  withdrawFromWaitlist,
} from "../src/lib/spot-offers.ts";
import { signSpotOfferToken, verifySpotOfferToken } from "../src/lib/spot-offer-token.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-10-03T15:00:00.000Z");
let seq = 0;
const nextId = () => `so_${++seq}`;

function entry(id, extra = {}) {
  return {
    id,
    daycareId: "d1",
    userId: id,
    ageGroup: "infant",
    status: "waiting",
    joinedAt: "2026-10-01T12:00:00.000Z",
    ...extra,
  };
}

test("waitlist is free on every plan and mail stays off", () => {
  assert.equal(waitlistIncludedOnEveryPlan(), true);
  assert.equal(FLAG_DEFAULTS.FEATURE_SPOT_OFFER_MAIL, false);
  assert.equal(spotOfferMailEnabled({}), false);
  assert.deepEqual(spotOfferMailPlan(false), { sendEmail: false, reason: "flag_off" });
  assert.equal(spotOfferMailPlan(true).sendEmail, true);
  assert.equal(rejectWaitlistFee({ fee: 25 }), WAITLIST_FEE_FORBIDDEN);
  assert.equal(rejectWaitlistFee({ amount: "40" }), WAITLIST_FEE_FORBIDDEN);
  assert.equal(rejectWaitlistFee({ childLabel: "Ada" }), null);
  assert.equal(rejectWaitlistFee({ fee: 0 }), null);
  const en = spotOfferCopy("en");
  const fr = spotOfferCopy("fr");
  assert.match(en.joinLead, /does not charge a waitlist fee/i);
  assert.match(fr.joinLead, /aucuns frais/i);
  assert.doesNotMatch(`${en.pageLead} ${en.deskLead} ${fr.pageLead}`, /—|free forever|Winnipeg-based/i);
  assert.match(readFileSync(join(root, "migrations/0078_spot_offers.sql"), "utf8"), /no fee column/i);
  assert.doesNotMatch(readFileSync(join(root, "migrations/0078_spot_offers.sql"), "utf8"), /fee_cents|waitlist_fee/i);
});

test("a decline or expiry offers the next family within 48 hours", () => {
  const state = {
    entries: [
      entry("a", { joinedAt: "2026-10-01T12:00:00.000Z" }),
      entry("b", { joinedAt: "2026-10-02T12:00:00.000Z" }),
      entry("c", { ageGroup: "toddler", joinedAt: "2026-10-01T13:00:00.000Z" }),
    ],
    offers: [],
  };
  const sent = sendSpotToFamily(state, "a", now, nextId);
  assert.equal(sent.ok, true);
  assert.equal(sent.createdOffers.length, 1);
  assert.equal(sent.createdOffers[0].userId, "a");
  assert.equal(Date.parse(sent.createdOffers[0].expiresAt) - now, SPOT_OFFER_WINDOW_MS);
  assert.equal(offerExpiresAt(now), sent.createdOffers[0].expiresAt);
  const blocked = sendSpotToFamily(sent.state, "b", now, nextId);
  assert.equal(blocked.ok, false);

  const declined = respondToOffer(sent.state, sent.createdOffers[0].id, "decline", now + 1000, nextId);
  assert.equal(declined.ok, true);
  assert.equal(declined.createdOffers.at(-1)?.userId, "b");
  assert.equal(declined.state.entries.find((row) => row.id === "a")?.status, "declined");
  assert.equal(declined.state.entries.find((row) => row.id === "c")?.status, "waiting");

  const later = now + SPOT_OFFER_WINDOW_MS + 1000;
  const expired = expireDue(declined.state, later, nextId);
  assert.equal(expired.createdOffers.length, 0);
  assert.equal(expired.state.offers.find((row) => row.userId === "b")?.status, "expired");
  assert.equal(placeInLine(sent.state.entries, "a"), 1);
});

test("accepting a spot does not auto-offer the next family", () => {
  const state = {
    entries: [entry("a"), entry("b", { joinedAt: "2026-10-02T12:00:00.000Z" })],
    offers: [],
  };
  const sent = sendSpotToFamily(state, "a", now, nextId);
  const accepted = respondToOffer(sent.state, sent.createdOffers[0].id, "accept", now + 1000, nextId);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.createdOffers.length, 0);
  assert.equal(accepted.state.entries.find((row) => row.id === "b")?.status, "waiting");
});

test("withdrawing the offered family moves the offer on", () => {
  const state = {
    entries: [entry("a"), entry("b", { joinedAt: "2026-10-02T12:00:00.000Z" })],
    offers: [],
  };
  const sent = sendSpotToFamily(state, "a", now, nextId);
  const left = withdrawFromWaitlist(sent.state, "a", now + 1000, nextId);
  assert.equal(left.ok, true);
  assert.equal(left.state.entries.find((row) => row.id === "a")?.status, "withdrawn");
  assert.equal(left.createdOffers.at(-1)?.userId, "b");
});

test("signed offer links fail closed without a secret and expire", () => {
  assert.equal(signSpotOfferToken({ offerId: "o1", userId: "u1", exp: now + 1000 }, ""), null);
  const token = signSpotOfferToken({ offerId: "o1", userId: "u1", exp: now + 1000 }, "test-secret");
  assert.ok(token);
  assert.equal(verifySpotOfferToken(token, "test-secret", now)?.offerId, "o1");
  assert.equal(verifySpotOfferToken(token, "other", now), null);
  assert.equal(verifySpotOfferToken(token, "test-secret", now + 5000), null);
  assert.match(readFileSync(join(root, "src/lib/server/spot-offers.ts"), "utf8"), /spotOfferMailPlan\(spotOfferMailEnabled\(\)\)/);
  assert.match(readFileSync(join(root, ".env.example"), "utf8"), /FEATURE_SPOT_OFFER_MAIL=0/);
});
