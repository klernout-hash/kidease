import assert from "node:assert/strict";
import { test } from "node:test";
import { calcDetourMinutes, calcSiblingSplitDetour, detourPill } from "../src/lib/commute-isochrone.ts";
import {
  BILLING_DAYS_PER_MONTH,
  PROVINCES,
  QC_REDUCED_DAILY,
  TEN_A_DAY_MONTHLY,
  estimateNetCost,
  qcTaxCreditRate,
  t778Cap,
} from "../src/lib/net-cost-engine.ts";
import { RATIO_PROVINCES, ratioRule, ratioStatus } from "../src/lib/provincial-ratios.ts";
import { INSPECTION_PROVINCES, inspectionChecklistBadge, inspectionPortal } from "../src/lib/provincial-inspections.ts";
import { buildRl24Summary, buildT778Receipt } from "../src/lib/tax-receipts.ts";
import { BROADCAST_MAX, planUrgentBroadcast } from "../src/lib/urgent-broadcast.ts";
import { qcMilieuPrivacyCentroid } from "../src/lib/qc-home-daycare.ts";
import { pickCardMicroPills, siblingFitBadge } from "../src/lib/card-micro-pills.ts";
import { parsePioneerSearch } from "../src/lib/pioneer-filters.ts";
import { reviewDimensionBars } from "../src/lib/review-dimensions.ts";
import { knownListingMonthlyFee, realMonthlyFee } from "../src/lib/listing-fee.ts";
const home = { lat: 49.895, lng: -97.138 };
const work = { lat: 49.9, lng: -97.14 };
const centre = { lat: 49.88, lng: -97.15 };
const other = { lat: 49.84, lng: -97.16 };

test("detour minutes stay non-negative and grow when the stop is farther", () => {
  const near = calcDetourMinutes(home, work, centre, "drive");
  const far = calcDetourMinutes(home, work, { lat: 50.4, lng: -97.8 }, "drive");
  assert.equal(calcDetourMinutes(home, work, home, "drive") >= 0, true);
  assert.ok(far > near);
  assert.ok(calcDetourMinutes(home, work, centre, "walk") > calcDetourMinutes(home, work, centre, "drive"));
  assert.match(detourPill(3, "en"), /\+3 min on your commute/);
  assert.match(detourPill(3, "fr"), /\+3 min sur votre trajet/);
});

test("sibling split adds a second stop only when two centres are needed", () => {
  const single = calcSiblingSplitDetour({ home, work, stops: [centre], mode: "drive", childCount: 2 });
  const split = calcSiblingSplitDetour({ home, work, stops: [centre, other], mode: "transit", childCount: 2 });
  assert.equal(single.split, false);
  assert.equal(split.split, true);
  assert.ok(split.minutes >= single.minutes);
  assert.equal(siblingFitBadge({ ageMinMonths: 0, ageMaxMonths: 60, bands: ["infant", "preschool"] }), true);
  assert.equal(siblingFitBadge({ ageMinMonths: 0, ageMaxMonths: 18, bands: ["infant", "preschool"] }), false);
});

test("net cost covers every province without inventing a fee", () => {
  assert.equal(PROVINCES.length, 13);
  for (const province of PROVINCES) {
    const row = estimateNetCost({
      province,
      householdIncome: 70_000,
      ageBand: "preschool",
      grossMonthly: 1200,
      participating: true,
      qcSubsidized: province === "QC",
    });
    assert.equal(row.estimate, true);
    assert.ok(row.parentMonthly >= 0);
    assert.ok(row.parentMonthly <= 1200);
    assert.ok(Number.isFinite(row.parentDaily));
    assert.ok(row.t778AnnualSavings <= t778Cap("preschool"));
  }
  const mb = estimateNetCost({ province: "MB", householdIncome: 60_000, ageBand: "toddler", grossMonthly: 1400, participating: true });
  assert.equal(mb.parentMonthly, TEN_A_DAY_MONTHLY);
  const qc = estimateNetCost({
    province: "QC",
    householdIncome: 80_000,
    ageBand: "preschool",
    grossMonthly: 1400,
    participating: true,
    qcSubsidized: true,
  });
  assert.equal(qc.parentDaily, Math.round((QC_REDUCED_DAILY) * 100) / 100);
  assert.ok(Math.abs(qc.parentMonthly - QC_REDUCED_DAILY * BILLING_DAYS_PER_MONTH) < 0.02);
  const low = qcTaxCreditRate(20_000);
  const high = qcTaxCreditRate(200_000);
  assert.equal(low, 0.78);
  assert.equal(high, 0.26);
  const on = estimateNetCost({ province: "ON", householdIncome: 90_000, ageBand: "preschool", grossMonthly: 2000, participating: true });
  assert.ok(on.parentMonthly < 2000 * (1 - 0.5275));
  const richAb = estimateNetCost({ province: "AB", householdIncome: 200_000, ageBand: "infant", grossMonthly: 1500, participating: true });
  const poorAb = estimateNetCost({ province: "AB", householdIncome: 40_000, ageBand: "infant", grossMonthly: 1500, participating: true });
  assert.ok(poorAb.parentMonthly < richAb.parentMonthly);
  const blank = estimateNetCost({ province: "NS", householdIncome: 50_000, ageBand: "preschool", grossMonthly: 0, participating: true });
  assert.equal(blank.parentMonthly, 0);
});

test("statutory ratios exist for all 13 provinces", () => {
  assert.deepEqual([...RATIO_PROVINCES], [...INSPECTION_PROVINCES]);
  for (const province of RATIO_PROVINCES) {
    for (const band of ["infant", "toddler", "preschool", "school-age"]) {
      const rule = ratioRule(province, band);
      assert.ok(rule.staffToChildren >= 3);
      assert.ok(rule.maxGroup >= rule.staffToChildren);
    }
  }
  const onInfant = ratioRule("ON", "infant");
  assert.equal(ratioStatus(4, 1, onInfant), "out");
  assert.equal(ratioStatus(3, 1, onInfant), "ok");
});

test("inspection portals are official https links and checklists stay off unclaimed cards", () => {
  for (const province of INSPECTION_PROVINCES) {
    const link = inspectionPortal(province, "Test Centre", "en");
    assert.ok(link);
    assert.match(link.url, /^https:\/\//);
  }
  assert.equal(inspectionChecklistBadge([{ id: "a", ok: true }], false).show, false);
  assert.equal(inspectionChecklistBadge([{ id: "a", ok: true }], true).show, true);
});

test("T778 and RL-24 receipts name the family, not a child, and never invent a permit", () => {
  const t778 = buildT778Receipt({
    taxYear: 2026,
    receiptFor: "Nguyen family",
    providerName: "Centre",
    amountPaid: 2400,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  });
  assert.match(t778.text, /Receipt for: Nguyen family/);
  assert.match(t778.text, /Centre: Centre/);
  assert.match(t778.text, /Amount:/);
  assert.match(t778.text, /Period: 2026-01-01 to 2026-12-31/);
  assert.match(t778.text, /Receipt number: T778-2026/);
  assert.doesNotMatch(t778.text, /Child:|Amina|birthdate|allerg/i);
  const missing = buildRl24Summary({
    taxYear: 2026,
    receiptFor: "Parent",
    providerName: "CPE",
    permitOrNeq: "",
    slipNumber: "",
    boxA: 100,
  });
  assert.equal(missing.ok, false);
  const rl = buildRl24Summary({
    taxYear: 2026,
    receiptFor: "Parent",
    providerName: "CPE",
    permitOrNeq: "NEQ-123",
    slipNumber: "RL-9",
    boxA: 900,
  });
  assert.equal(rl.ok, true);
  if (rl.ok) {
    assert.match(rl.text, /Receipt for: Parent/);
    assert.match(rl.text, /Receipt number: RL-9/);
    assert.doesNotMatch(rl.text, /Child:|Leo|Box A|NEQ-123/);
  }
});

test("urgent broadcast stays inside 10 centres and one send per 7 days", () => {
  const centres = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    claimed: i < 12,
    ageBands: ["preschool"],
  }));
  const plan = planUrgentBroadcast(centres, { neededWithinDays: 7, signedIn: true, ageBand: "preschool" });
  assert.equal(plan.allowed, true);
  assert.equal(plan.centres.length, BROADCAST_MAX);
  assert.ok(plan.centres.every((centre) => centre.claimed));
  const cool = planUrgentBroadcast(centres, {
    neededWithinDays: 3,
    signedIn: true,
    lastBroadcastAt: new Date().toISOString(),
  });
  assert.equal(cool.reason, "cooldown");
  const late = planUrgentBroadcast(centres, { neededWithinDays: 21, signedIn: true });
  assert.equal(late.reason, "window");
  const guest = planUrgentBroadcast(centres, { neededWithinDays: 2, signedIn: false });
  assert.equal(guest.reason, "sign-in");
  const few = planUrgentBroadcast(centres.slice(0, 3), { neededWithinDays: 1, signedIn: true, ageBand: "infant" });
  assert.equal(few.centres.length, 0);
});

test("Québec home privacy centroid hides the street", () => {
  const pin = qcMilieuPrivacyCentroid({
    province: "QC",
    centreType: "home",
    city: "Montreal",
    postalCode: "H2X 1Y4",
    streetDisclosed: false,
  });
  assert.ok(pin);
  assert.equal(pin.radiusM, 300);
  assert.equal(pin.hideStreet, true);
  assert.equal("street" in pin, false);
  assert.equal(
    qcMilieuPrivacyCentroid({ province: "QC", centreType: "home", city: "Montreal", streetDisclosed: true }),
    null,
  );
  assert.equal(qcMilieuPrivacyCentroid({ province: "ON", centreType: "home", city: "Ottawa" }), null);
  assert.equal(qcMilieuPrivacyCentroid({ province: "QC", centreType: "centre", city: "Quebec" }), null);
});

test("search chips and review bars stay tied to real inputs", () => {
  const parsed = parsePioneerSearch({ cwelcc: "1", meals: "1", lang: "fr,zh,nope", openings: 1 });
  assert.equal(parsed.cwelcc, "1");
  assert.equal(parsed.lang, "fr,zh");
  assert.equal(parsed.openings, "1");
  const bars = reviewDimensionBars([{ dimensions: { safety: 4, value: 5 } }, { dimensions: { safety: 2 } }]);
  assert.equal(bars.find((bar) => bar.id === "safety")?.average, 3);
  assert.equal(bars.find((bar) => bar.id === "communication")?.average, null);
  const fromStars = reviewDimensionBars([{ rating: 4 }, { rating: 2, dimensions: { safety: 5 } }]);
  assert.equal(fromStars.find((bar) => bar.id === "safety")?.average, 4.5);
  assert.equal(fromStars.find((bar) => bar.id === "value")?.average, 3);
  assert.equal(realMonthlyFee(218), null);
  assert.equal(knownListingMonthlyFee({ preschoolMonthly: 900, infantMonthly: 218 }, "preschool"), 900);
  assert.equal(knownListingMonthlyFee({ programDaily: 10 }, "toddler"), 217.5);
  assert.equal(knownListingMonthlyFee({ programDaily: 9.65 }, "infant"), 209.89);
  const pills = pickCardMicroPills({
    home,
    work,
    stop: centre,
    mode: "drive",
    ageMinMonths: 0,
    ageMaxMonths: 70,
    bands: ["infant", "toddler"],
    spotsUpdatedAt: new Date().toISOString(),
    verified: true,
  });
  assert.ok(pills.length <= 2);
  assert.equal(pills[0]?.id, "detour");
});
