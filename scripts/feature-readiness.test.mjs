import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { showPayCtas, subscriptionsEnabled } from "../src/lib/features.ts";
import { placeInLine, SPOT_OFFER_WINDOW_MS } from "../src/lib/spot-offers.ts";
import { buildRl24Summary, buildT778Receipt } from "../src/lib/tax-receipts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("subscription and pay flags stay off", () => {
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_INAPP_CHAT, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_VIDEO, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SPOT_OFFER_MAIL, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_OPEN_SPOTS_CHECKIN_MAIL, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_OPEN_SPOTS_CHECKIN_SMS, false);
  assert.equal(subscriptionsEnabled({}), false);
  assert.equal(showPayCtas({ SHOW_PAY_CTAS: "1" }), false);
  assert.equal(showPayCtas({ SHOW_PAY_CTAS: "1", SUBSCRIPTIONS_ENABLED: "1" }), true);
  const env = src(".env.example");
  assert.match(env, /^SHOW_PAY_CTAS=0$/m);
  assert.match(env, /^SUBSCRIPTIONS_ENABLED=0$/m);
  assert.doesNotMatch(env, /^SHOW_PAY_CTAS=1$/m);
  assert.doesNotMatch(env, /^SUBSCRIPTIONS_ENABLED=1$/m);
  assert.doesNotMatch(src("package.json"), /@capacitor-community\/in-app-purchases|cordova-plugin-purchase|react-native-iap/);
  assert.match(src("docs/feature-readiness.md"), /do \*\*not\*\* build, enable, or turn on in-app subscriptions/i);
});

test("spot offers last 48 hours and waitlist rank is sign-up order", () => {
  assert.equal(SPOT_OFFER_WINDOW_MS, 48 * 60 * 60 * 1000);
  const line = [
    { id: "b", daycareId: "c", userId: "2", ageGroup: "infant", status: "waiting", joinedAt: "2026-02-01" },
    { id: "a", daycareId: "c", userId: "1", ageGroup: "infant", status: "waiting", joinedAt: "2026-01-01" },
    { id: "z", daycareId: "other", userId: "3", ageGroup: "infant", status: "waiting", joinedAt: "2025-01-01" },
  ];
  assert.equal(placeInLine(line, "a"), 1);
  assert.equal(placeInLine(line, "b"), 2);
  assert.match(src("src/routes/api/e2e-seed.ts"), /e2e-\$\{side\}@kidease\.test/);
  assert.match(src("src/lib/server/tour-calendar.ts"), /bookTourSlot/);
});

test("sample tax receipts, OSM commute, and DocuSign demo stay honest", () => {
  const t778 = buildT778Receipt({
    taxYear: 2026,
    receiptFor: "Ada Parent",
    providerName: "Maple Care",
    amountPaid: 1200,
    periodStart: "2026-01-01",
    periodEnd: "2026-06-30",
  });
  assert.equal(t778.kind, "t778");
  assert.match(t778.text, /Maple Care/);
  assert.match(t778.text, /1200|1,200/);
  const rl = buildRl24Summary({
    taxYear: 2026,
    receiptFor: "Ada Parent",
    providerName: "Garderie Érable",
    boxA: 800,
    permitOrNeq: "1234567890",
    slipNumber: "RL-1",
  });
  assert.equal(rl.ok, true);
  if (rl.ok) assert.match(rl.text, /Garderie/);
  const map = src("src/lib/osm-map.ts");
  assert.match(map, /openfreemap|openstreetmap/i);
  assert.doesNotMatch(map, /maps\.googleapis\.com/);
  assert.match(src("src/lib/server/contracts.ts"), /demo_/);
  assert.match(src("docs/feature-readiness.md"), /FEATURE_SPOT_OFFER_MAIL/);
  assert.match(src("docs/feature-readiness.md"), /Leave off/);
});
