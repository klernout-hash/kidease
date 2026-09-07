import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BOOKING_CARD_PAY_DISABLED,
  INTERAC_PENDING_STATUS,
  INTERAC_SELF_CONFIRM_DISABLED,
  bookingPayInsertStatus,
  canParentMarkBookingPaid,
  isDecorativeBookingPayMethod,
} from "../src/lib/booking-pay.ts";
import { cronAuthorized } from "../src/lib/cron-auth.ts";
import { allowAiSpend, resetAiSpendForTests } from "../src/lib/ai-spend.ts";
import { isTwoFactorVerified } from "../src/lib/two-factor-cookie.ts";
import { staffTwoFactorRequired } from "../src/lib/desks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("booking pay cannot mark paid without Stripe", () => {
  assert.equal(canParentMarkBookingPaid(), false);
  assert.equal(isDecorativeBookingPayMethod("card"), true);
  assert.equal(isDecorativeBookingPayMethod("apple"), true);
  assert.equal(isDecorativeBookingPayMethod("paypal"), true);
  assert.throws(() => bookingPayInsertStatus("card"), /Stripe Checkout|support@kidease\.ca/);
  assert.equal(bookingPayInsertStatus("interac"), INTERAC_PENDING_STATUS);
  assert.notEqual(INTERAC_PENDING_STATUS, "paid");

  const family = src("src/lib/server/family.ts");
  assert.match(family, /bookingPayInsertStatus/);
  assert.match(family, /canParentMarkBookingPaid/);
  assert.doesNotMatch(family, /status = data\.method === "interac" \? "pending" : "paid"/);
  assert.doesNotMatch(family, /set status = 'paid' where id = \$\{paymentId\}/);

  const pay = src("src/routes/pay.$bookingId.tsx");
  assert.doesNotMatch(pay, /autoComplete="cc-number"/);
  assert.doesNotMatch(pay, /t\("cardNumber"\)/);
  assert.match(pay, /bookingPayDisabled/);
  assert.match(pay, /createBillCheckout|payUseBill|SUPPORT_INBOX_EMAIL/);
});

test("Interac cannot self-confirm paid", () => {
  assert.match(INTERAC_SELF_CONFIRM_DISABLED, /cannot mark it paid/i);
  const family = src("src/lib/server/family.ts");
  assert.match(family, /pending_review/);
  assert.match(family, /INTERAC_SELF_CONFIRM_DISABLED/);
  const pay = src("src/routes/pay.$bookingId.tsx");
  assert.match(pay, /interacPendingReview/);
  assert.doesNotMatch(pay, /setResult\(\{ \.\.\.result, status: "paid" \}\)/);
});

test("requireAdmin checks verified 2FA and fails closed", () => {
  assert.equal(isTwoFactorVerified("u1", null, "secret"), false);
  assert.equal(staffTwoFactorRequired("/admin"), true);
  assert.equal(staffTwoFactorRequired("/admin-contracts"), true);
  assert.equal(staffTwoFactorRequired("/support/sc_1"), true);
  assert.equal(staffTwoFactorRequired("/parent"), false);

  const roles = src("src/lib/server/roles.ts");
  assert.match(roles, /assertTwoFactorVerified/);
  assert.match(roles, /emailVerified/);
  const twoFa = src("src/lib/server/two-factor.server.ts");
  assert.match(twoFa, /Two-factor verification required/);
  assert.match(twoFa, /fail closed|Fail closed/);
  assert.match(twoFa, /getCookie/);
  const twoFaClient = src("src/lib/server/two-factor.ts");
  // Client-reachable createServerFn module must not import the server specifier.
  assert.doesNotMatch(twoFaClient, /@tanstack\/react-start\/server/);
  assert.doesNotMatch(twoFaClient, /function twoFactorCookieRaw/);
  assert.doesNotMatch(twoFaClient, /export function assertTwoFactorVerified/);
  assert.match(twoFaClient, /two-factor\.server/);
  const gates = src("src/lib/auth/gates.tsx");
  assert.match(gates, /staffTwoFactorRequired\(next\) \? "need" : "ok"/);
});

test("askKidEase and matchCentres require auth", () => {
  resetAiSpendForTests();
  assert.equal(allowAiSpend("user-1"), true);
  const ai = src("src/lib/server/ai.ts");
  assert.match(ai, /authMiddleware/);
  assert.match(ai, /allowAiSpend/);
  const askBlock = ai.slice(ai.indexOf("export const askKidEase"));
  assert.match(askBlock, /\.middleware\(\[authMiddleware\]\)/);
  const matchBlock = ai.slice(ai.indexOf("export const matchCentres"), ai.indexOf("export const askKidEase"));
  assert.match(matchBlock, /\.middleware\(\[authMiddleware\]\)/);
  const bot = src("src/components/help-bot.tsx");
  assert.match(bot, /helpBotSignIn/);
  assert.match(bot, /useCurrentUserState/);
});

test("cron secrets are header-only", () => {
  const secret = "test-cron-secret";
  assert.equal(
    cronAuthorized(new Request("https://kidease.ca/api/digest", { headers: { authorization: `Bearer ${secret}` } }), secret),
    true,
  );
  assert.equal(
    cronAuthorized(new Request("https://kidease.ca/api/digest?secret=test-cron-secret"), secret),
    false,
  );
  const digest = src("src/routes/api/digest.ts");
  const alerts = src("src/routes/api/search-alerts.ts");
  const seed = src("src/routes/api/seed-catalog.ts");
  assert.match(digest, /cronAuthorized/);
  assert.match(alerts, /cronAuthorized/);
  assert.match(seed, /cronAuthorized/);
  assert.doesNotMatch(digest, /searchParams\.get\("secret"\)/);
  assert.doesNotMatch(alerts, /searchParams\.get\("secret"\)/);
  assert.doesNotMatch(seed, /searchParams\.get\("secret"\)/);
});

test("account oracle stays generic", () => {
  const oracle = src("src/lib/server/email-sign-in.ts");
  assert.match(oracle, /kind: "unknown"/);
  assert.doesNotMatch(oracle, /return explainEmailSignInFailureFor/);
  const login = src("src/routes/login.tsx");
  assert.doesNotMatch(login, /explainEmailSignInFailure/);
  assert.match(src(".github/workflows/ci.yml"), /npx tsc --noEmit/);
  assert.match(src(".github/workflows/ci.yml"), /npm test/);
  assert.match(src(".github/workflows/ci.yml"), /npx eslint/);
  assert.match(src("src/components/site-footer.tsx"), /SUPPORT_INBOX_EMAIL/);
});

test("booking pay helper copy stays honest", () => {
  assert.match(BOOKING_CARD_PAY_DISABLED, /support@kidease\.ca/);
  assert.match(src("src/lib/copy.ts"), /featPay: "Bills in-app"/);
  assert.doesNotMatch(src("src/lib/copy.ts"), /featPay: "Deposits in-app"/);
});

test("parent Pay / Start Plus copy does not contradict live Stripe", () => {
  const copy = src("src/lib/copy.ts");
  assert.doesNotMatch(copy, /Card Pay stays off until Stripe is live/);
  assert.doesNotMatch(copy, /Stripe live keys are set — charges can settle/);
  assert.match(copy, /ledgerLiveParent/);
  assert.match(copy, /Start Plus uses Stripe Checkout/);
  const honesty = src("src/components/listing-status-badge.tsx");
  assert.doesNotMatch(honesty, /Stripe live keys are set/);
  assert.match(honesty, /surface = "money"/);
  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /surface="parent"/);
  assert.match(parent, /ParentPlusPanel/);
  const bookingPay = src("src/routes/pay.$bookingId.tsx");
  assert.match(bookingPay, /surface="booking"/);
});
