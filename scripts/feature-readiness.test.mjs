import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { showPayCtas, subscriptionsEnabled } from "../src/lib/features.ts";
import { placeInLine, SPOT_OFFER_WINDOW_MS } from "../src/lib/spot-offers.ts";
import { buildTaxReceiptGroups, federalReceiptLines, rl24ReceiptLines } from "../src/lib/tax-receipts.ts";

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
  const paid = buildTaxReceiptGroups({
    invoices: [
      {
        id: "inv-maple",
        status: "paid",
        amountCents: 120000,
        paidAt: "2026-06-30",
        period: "2026-01",
        daycareId: "d1",
        daycareName: "Maple Care",
        province: "ON",
        parentUserId: "p1",
        parentName: "Ada Parent",
      },
      {
        id: "inv-open",
        status: "sent",
        amountCents: 99900,
        paidAt: "2026-06-30",
        period: "2026-02",
        daycareId: "d1",
        daycareName: "Maple Care",
        province: "ON",
        parentUserId: "p1",
        parentName: "Ada Parent",
      },
    ],
  });
  assert.equal(paid.groups.length, 1);
  assert.equal(paid.groups[0].amountCents, 120000);
  const t778 = federalReceiptLines(paid.groups[0]).join("\n");
  assert.match(t778, /Maple Care/);
  assert.match(t778, /\$1,200\.00/);
  assert.doesNotMatch(t778, /\$999/);
  const qc = buildTaxReceiptGroups({
    invoices: [
      {
        id: "inv-qc",
        status: "paid",
        amountCents: 80000,
        paidAt: "2026-04-02",
        period: "2026-04",
        daycareId: "d2",
        daycareName: "Garderie Erable",
        province: "QC",
        parentUserId: "p1",
        parentName: "Ada Parent",
      },
    ],
  });
  const rl = rl24ReceiptLines(qc.groups[0]);
  assert.ok(rl);
  assert.match(rl.join("\n"), /Garderie/);
  const map = src("src/lib/osm-map.ts");
  assert.match(map, /openfreemap|openstreetmap/i);
  assert.doesNotMatch(map, /maps\.googleapis\.com/);
  assert.match(src("src/lib/server/contracts.ts"), /demo_/);
  assert.match(src("docs/feature-readiness.md"), /FEATURE_SPOT_OFFER_MAIL/);
  assert.match(src("docs/feature-readiness.md"), /Leave off/);
});
