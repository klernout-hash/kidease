// Re-run after the desktop visual job timed out on an apt mirror, not a product failure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  TRANSLATION_COPY,
  badgeAllowed,
  emergencySms,
  formSms,
  inspectionShown,
  muniCount,
  officialGrantCents,
  overtimeMinutes,
  parentCannotOpenPayouts,
  payoutLabel,
  provinceReportReady,
  refundFeeCents,
  scopeAllows,
  testModePayment,
} from "../src/lib/phase3-rules.ts";

test("phase 3 and the public API stay off, unsent, and uncharged", () => {
  for (const key of [
    "FEATURE_RULES_BADGE",
    "FEATURE_FORM_SMS",
    "FEATURE_EMERGENCY_SMS",
    "FEATURE_TRANSLATION_UI",
    "FEATURE_OVERTIME",
    "FEATURE_CARD_PAY",
    "FEATURE_AUTOPAY",
    "FEATURE_PAD",
    "FEATURE_MANDATORY_AUTOPAY",
    "FEATURE_REFUNDS",
    "FEATURE_CCFRI",
    "FEATURE_AB_GRANT",
    "FEATURE_PAYOUT_STATUS",
    "FEATURE_MUNI_STATS",
    "FEATURE_PUBLIC_API",
    "FEATURE_INSPECTION_HISTORY",
    "FEATURE_PROVINCE_REPORTS",
  ]) {
    assert.equal(FLAG_DEFAULTS[key], false, key);
  }
  assert.equal(badgeAllowed({ methodPublished: false, meetsRule: true }), false);
  assert.equal(badgeAllowed({ methodPublished: true, meetsRule: true }), true);
  assert.equal(inspectionShown([{ source: "public", date: "2026-01-01" }, { source: "rumour", date: "2026-01-01" }]), 1);
  assert.equal(provinceReportReady({ province: "MB", rows: 2 }), true);
  assert.equal(provinceReportReady({ province: "", rows: 2 }), false);
  assert.equal(formSms().deliver, false);
  assert.equal(emergencySms().deliver, false);
  assert.match(TRANSLATION_COPY.fr, /ne tourne pas/);
  assert.equal(overtimeMinutes({ worked: 90, scheduled: 60 }), 30);
  assert.equal(testModePayment({ mode: "live" }).reason, "live_blocked");
  assert.equal(testModePayment({ mode: "test" }).charged, false);
  assert.equal(refundFeeCents(10000), 300);
  assert.equal(officialGrantCents({ program: true, officialCents: null }), null);
  assert.equal(officialGrantCents({ program: true, officialCents: 1200 }), 1200);
  assert.equal(payoutLabel("nope"), "unknown");
  assert.equal(muniCount([{ city: "Winnipeg" }, { city: "Brandon" }], "winnipeg"), 1);
  assert.equal(scopeAllows(["listings:read"], "health:read"), false);
  assert.equal(scopeAllows(["listings:read"], "listings:read"), true);
  assert.equal(scopeAllows(["families:read"], "billing:write"), false);
  assert.equal(parentCannotOpenPayouts("parent"), true);
  assert.equal(parentCannotOpenPayouts("billing"), false);
});
