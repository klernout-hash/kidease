import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { webhookProductEvent } from "../src/lib/webhook-product-events.ts";
import { isProductEvent, sanitizeProductProperties } from "../src/lib/product-events.ts";
import {
  isLoginBounce,
  LOGIN_BOUNCE_WINDOW_MS,
  LOGIN_SUBMIT_MARK_KEY,
  markLoginSubmitted,
  clearLoginSubmitted,
  takeLoginBounce,
} from "../src/lib/auth/login-bounce.ts";
import { dropEmptyExceptionEvent, isEmptyExceptionEvent } from "../src/lib/posthog-errors.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("C7: the listing page sends exactly one listing_viewed, always with listing_id", () => {
  const page = src("src/routes/daycare.$slug.tsx");
  const sends = page.match(/"listing_viewed"/g) || [];
  assert.equal(sends.length, 1, "one listing_viewed call");
  assert.doesNotMatch(page, /trackProductEvent\("listing_viewed"/);
  const at = page.indexOf('captureRankingEvent("listing_viewed"');
  const call = page.slice(at, page.indexOf("});", at));
  assert.match(call, /listing_id: id/);
  assert.match(call, /province: provinceCode/);
  assert.match(call, /surface: "listing"/);
  // Guarded by a ref keyed on the listing id, so a refetch does not resend.
  const effect = page.slice(page.lastIndexOf("useEffect(", at), at);
  assert.match(effect, /viewedListingId\.current === id\) return;/);
  assert.match(effect, /viewedListingId\.current = id;/);
  const events = src("src/lib/ranking/events.ts");
  assert.match(events, /"province",\n {2}"surface",/);
});

test("C7: login_funnel has redirected_2fa and bounced outcomes", () => {
  const funnel = src("src/lib/auth/login-funnel.ts");
  assert.match(funnel, /\| "redirected_2fa"/);
  assert.match(funnel, /\| "bounced"/);
  const cont = funnel.slice(funnel.indexOf("export async function continueAfterSignIn"));
  assert.match(cont, /if \(needTwoFactor\) \{\s*captureLoginFunnel\(\{ step: "redirected_2fa"/);
  assert.match(funnel, /clearLoginSubmitted\(\);\s*captureLoginFunnel\(\{ step: "desk_landed"/);
  const login = src("src/routes/login.tsx");
  assert.match(login, /if \(takeLoginBounce\(\)\) captureLoginFunnel\(\{ step: "bounced"/);
  assert.match(login, /step: "submitted", method: "email", native: isNative\(\) \}\);\s*markLoginSubmitted\(\);/);
});

test("C7: a /login view soon after a submit counts as a bounce, once", () => {
  const now = 1_800_000_000_000;
  assert.equal(isLoginBounce(null, now), false);
  assert.equal(isLoginBounce(now - 1000, now), true);
  assert.equal(isLoginBounce(now - LOGIN_BOUNCE_WINDOW_MS - 1, now), false);
  assert.equal(isLoginBounce(now + 5000, now), false);
  const bag = new Map();
  const storage = {
    getItem: (k) => (bag.has(k) ? bag.get(k) : null),
    setItem: (k, v) => bag.set(k, String(v)),
    removeItem: (k) => bag.delete(k),
  };
  markLoginSubmitted(now - 2000, storage);
  assert.equal(bag.get(LOGIN_SUBMIT_MARK_KEY), String(now - 2000));
  assert.equal(takeLoginBounce(now, storage), true);
  assert.equal(takeLoginBounce(now, storage), false, "cleared after one read");
  markLoginSubmitted(now - 2000, storage);
  clearLoginSubmitted(storage);
  assert.equal(takeLoginBounce(now, storage), false);
});

test("C7: webhook events only for paths that exist today", () => {
  assert.deepEqual(webhookProductEvent("charge.refunded", { billStatus: "refunded" }), {
    event: "refund_issued",
    properties: { source: "centre_bill", result: "refunded" },
  });
  assert.equal(webhookProductEvent("charge.refunded", { billStatus: null }), null);
  assert.equal(webhookProductEvent("payout.paid", {})?.event, "payout_paid");
  assert.equal(webhookProductEvent("invoice.payment_failed", { invoiceId: "inv_1" })?.event, "bill_payment_failed");
  assert.equal(webhookProductEvent("invoice.payment_failed", { invoiceId: null }), null);
  // Not handled by the webhook yet (PAD / 3DS work): no event.
  assert.equal(webhookProductEvent("payment_intent.processing", {}), null);
  assert.equal(webhookProductEvent("payment_intent.payment_failed", {}), null);
  for (const name of ["booking_created", "bill_payment_failed", "refund_issued", "payout_paid"]) {
    assert.equal(isProductEvent(name), true, name);
  }
  assert.deepEqual(sanitizeProductProperties("refund_issued", { source: "centre_bill", email: "a@b.ca" }), {
    source: "centre_bill",
  });
  const hook = src("src/routes/api/stripe.webhook.ts");
  assert.match(hook, /webhookProductEvent\(type, \{ billStatus: bill\?\.status \?\? null, invoiceId \}\)/);
  assert.match(hook, /captureServerProductEvent\(planned\.event, planned\.properties\)/);
});

test("C7: booking_created fires where bookings are inserted today", () => {
  const family = src("src/lib/server/family.ts");
  assert.match(family, /"booking_created",\s*\{ province: provinceCode\(d\.province\), result: status, source: "booking" \}/);
  assert.match(family, /"booking_created",\s*\{ province: provinceCode\(d\.province\), result: "requested", source: "spot_request" \}/);
  assert.match(src("src/lib/server/multi-apply.ts"), /"booking_created",\s*\{ result: "requested", source: "multi_apply"/);
});

test("C7: empty $exception events are dropped at the client", () => {
  assert.equal(isEmptyExceptionEvent({ event: "$exception", properties: {} }), true);
  assert.equal(
    isEmptyExceptionEvent({ event: "$exception", properties: { $exception_list: [{ type: "", value: " " }] } }),
    true,
  );
  assert.equal(
    isEmptyExceptionEvent({ event: "$exception", properties: { $exception_list: [{ type: "TypeError", value: "" }] } }),
    false,
  );
  assert.equal(isEmptyExceptionEvent({ event: "$exception", properties: { $exception_message: "boom" } }), false);
  assert.equal(isEmptyExceptionEvent({ event: "login_funnel", properties: {} }), false);
  assert.equal(isEmptyExceptionEvent(null), false);
  const kept = { event: "$pageview", properties: {} };
  assert.equal(dropEmptyExceptionEvent(kept), kept);
  assert.equal(dropEmptyExceptionEvent({ event: "$exception", properties: {} }), null);
  assert.match(src("src/lib/posthog.ts"), /before_send: dropEmptyExceptionEvent/);
});
