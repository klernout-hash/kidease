import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  CRA_CHILD_CARE_URL,
  CUSTODY_GUIDANCE,
  autoFilePack,
  bookingChoice,
  bothParentsKeepAccess,
  canRemoveParent,
  capacityBlock,
  chargeExtraDay,
  checkoutSafetyAlert,
  custodyVisible,
  exchangeFeeCents,
  extraDayFee,
  headcount,
  hideFromParent,
  latestOrder,
  packIssues,
  parentFeeOk,
  quebecCounters,
  receiptGoesTo,
  reofferVacantSpot,
  reserveSpot,
  storePortalPassword,
  taxAdvice,
  waitlistJump,
} from "../src/lib/phase6-rules.ts";

test("both parents stay unless an order or a joint note says otherwise", () => {
  for (const key of ["FEATURE_CUSTODY_ORDERS", "FEATURE_OPERATOR_PACKS", "FEATURE_EXTRA_DAYS", "FEATURE_THIRD_PARTY_PAYER"]) {
    assert.equal(FLAG_DEFAULTS[key], false, key);
  }
  assert.equal(bothParentsKeepAccess(), true);
  assert.equal(hideFromParent(), false);
  assert.equal(canRemoveParent({ uploadedOrder: false, jointInstruction: false }), false);
  assert.equal(canRemoveParent({ uploadedOrder: true, jointInstruction: false }), true);
  assert.equal(canRemoveParent({ uploadedOrder: false, jointInstruction: true }), true);
  assert.equal(custodyVisible({ role: "billing", centreStaff: true }), false);
  assert.equal(custodyVisible({ role: "parent", centreStaff: false }), false);
  assert.equal(custodyVisible({ role: "staff", centreStaff: true }), true);
  assert.equal(custodyVisible({ role: "staff", centreStaff: false }), false);
  assert.equal(checkoutSafetyAlert(true), true);
  assert.match(CUSTODY_GUIDANCE.fr, /police/);
  assert.equal(latestOrder([{ id: "a", effectiveOn: "2026-01-01", uploaded: true }, { id: "b", effectiveOn: "2026-06-01", uploaded: true }])?.id, "b");
});

test("report packs are drafts and never log into a government site", () => {
  assert.equal(autoFilePack(), false);
  assert.equal(storePortalPassword(), false);
  assert.match(packIssues({ kind: "attendance", rows: 0, province: "MB" }).join(","), /empty/);
  assert.equal(packIssues({ kind: "attendance", rows: 2, province: "ON" }).length, 0);
  assert.match(packIssues({ kind: "enrolment", rows: 1, province: "XX" }).join(","), /province/);
});

test("an extra day cannot pass capacity and an exchange day has no fee", () => {
  assert.equal(headcount({ present: 8, dropIns: 1 }), 9);
  assert.equal(capacityBlock({ present: 8, dropIns: 1, capacity: 8, groupMax: 16, staff: 4, childrenPerStaff: 8 }), "capacity");
  assert.equal(capacityBlock({ present: 4, dropIns: 0, capacity: 8, groupMax: 8, staff: 1, childrenPerStaff: 3 }), "ratio");
  assert.equal(bookingChoice({ swapFrom: "2026-11-12" }), "exchange");
  assert.equal(bookingChoice({ swapFrom: null }), "extra");
  assert.equal(exchangeFeeCents(), 0);
  assert.equal(extraDayFee({ enteredCents: null, capCents: 2000, mode: "block" }).cents, null);
  assert.equal(extraDayFee({ enteredCents: 2500, capCents: 2000, mode: "block" }).blocked, true);
  assert.equal(extraDayFee({ enteredCents: 1500, capCents: 2000, mode: "warn" }).blocked, false);
  const days = Array.from({ length: 21 }, (_, index) => `2026-11-${String(index + 1).padStart(2, "0")}`);
  assert.equal(quebecCounters(days).overFourWeeks, true);
  assert.equal(chargeExtraDay().charged, false);
  assert.equal(reofferVacantSpot(), false);
});

test("a third party can pay, and the family is not charged above the lawful fee", () => {
  assert.equal(receiptGoesTo("employer"), "employer");
  assert.equal(parentFeeOk({ chargedCents: 800, lawfulParentCents: 700 }), false);
  assert.equal(parentFeeOk({ chargedCents: 700, lawfulParentCents: 700 }), true);
  assert.equal(waitlistJump(), false);
  assert.equal(reserveSpot(), false);
  assert.equal(taxAdvice(), null);
  assert.match(CRA_CHILD_CARE_URL, /^https:\/\/www\.canada\.ca\//);
});
