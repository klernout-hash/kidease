import assert from "node:assert/strict";
import { test } from "node:test";
import { publicErrorMessage } from "../src/lib/public-error.ts";
import { publicPayMessage, mapCheckoutError } from "../src/lib/stripe-public-error.ts";

test("call and upload setup details use the caller's localized error", () => {
  const fallback = "Réessayez dans un instant.";
  for (const message of [
    "Twilio Video room request failed.",
    "Twilio Video room failed (53103).",
    "Twilio Video room had no SID.",
    "Calling is not set up. Set TWILIO_ACCOUNT_SID and TWILIO_API_KEY_SECRET.",
    "Calling is not open yet.",
    "Video is scaffolded only. FEATURE_VIDEO is off.",
    "R2 is not configured. Set R2_ACCESS_KEY_ID on the Vercel project.",
    "R2_BUCKET is not a valid bucket name.",
  ]) {
    assert.equal(publicErrorMessage(message, fallback), fallback, message);
    assert.equal(publicErrorMessage(new Error(message), fallback), fallback, message);
  }
});

test("actionable file, sign-in, room, and billing errors remain visible", () => {
  for (const message of [
    "Upload a PDF or image under 4 MB.",
    "Confirm your sign-in to continue.",
    "This video room was not found.",
    "Choose a child.",
    "This bill can no longer be sent.",
    "Payment is available after the daycare approves your request.",
  ]) {
    assert.equal(publicErrorMessage(new Error(message), "Try again."), message);
    assert.equal(publicPayMessage(new Error(message), "Try again."), message);
  }
});

test("bill and subscription setup failures use public payment copy", () => {
  const fallback = "Online payment is unavailable. Nothing was charged.";
  for (const message of [
    "Card Pay stays off until Stripe live keys are on. This bill is on the internal ledger (not charged).",
    "Parent Plus price ID is not set. Add STRIPE_PRICE_PLUS_MONTHLY on Vercel.",
    "This add-on’s Stripe price ID is not set. Add it on Vercel, then try again.",
    "No Stripe customer on this profile yet. Start checkout first.",
    "Billing portal stays off until Stripe live keys are on.",
    "Stripe is not configured",
    "Stripe did not return a Pay link",
    "No such price: price_missing",
  ]) {
    assert.equal(publicPayMessage(new Error(message), fallback), fallback, message);
  }
});

test("display filtering does not change the error or server diagnostic mapping", () => {
  const error = new Error("Billing portal stays off until Stripe live keys are on.");
  const before = mapCheckoutError(error);
  publicPayMessage(error, "Billing could not open.");
  assert.equal(error.message, "Billing portal stays off until Stripe live keys are on.");
  assert.deepEqual(mapCheckoutError(error), before);
  assert.equal(publicErrorMessage(null, "Try again."), "Try again.");
});
