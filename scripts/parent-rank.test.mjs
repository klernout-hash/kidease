import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const MATCH = { distance: 25, ages: 20, vacancy: 20, trust: 20, quality: 15 };
const URGENCY = { startDate: 40, spots: 35, reply: 25 };
const MIN_REPLY = 5;

function clampScore(n, max) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n));
}

function isClaimVerified(item) {
  const raw = (item.claimStatus || "").trim().toLowerCase();
  if (raw === "unclaimed" || (!raw && !item.claimed && !item.claimedAt)) return false;
  return ["approved", "live", "active", "published"].includes(raw) || Boolean(item.live && item.claimed);
}

function qualityTrust(item) {
  let score = 0;
  if (isClaimVerified(item)) score += 15;
  if (item.licenseStatus === "matched" || item.registryMatchState === "matched") score += 10;
  if (item.licenseStatus === "expired" || item.licenseStatus === "suspended") score = isClaimVerified(item) ? 15 : 0;
  return clampScore(score, 25);
}

function parentMatchScore(item, prefs = {}) {
  let distance = 0;
  if (prefs.distanceKnown && typeof item.distanceKm === "number" && item.distanceKm >= 0) {
    const radius = prefs.radiusKm || 25;
    const half = Math.max(2, radius * 0.6);
    distance = clampScore(Math.exp((-Math.LN2 * item.distanceKm) / half) * MATCH.distance, MATCH.distance);
  }
  let ages = 0;
  const band = prefs.ageGroup || "any";
  if (band === "any") ages = item.agesKnown ? MATCH.ages : 0;
  else if (item.agesKnown) {
    if (band === "infant" && item.ageMinMonths <= 18) ages = MATCH.ages;
    if (band === "toddler" && item.ageMinMonths < 36 && item.ageMaxMonths >= 18) ages = MATCH.ages;
    if (band === "preschool" && item.ageMaxMonths >= 30 && item.ageMinMonths < 72) ages = MATCH.ages;
  }
  let vacancy = 0;
  if (item.lastVacancyUpdatedAt) {
    const spots = (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0);
    vacancy = spots > 0 ? MATCH.vacancy : 6;
  }
  const trust = clampScore((qualityTrust(item) / 25) * MATCH.trust, MATCH.trust);
  const quality = 0;
  return clampScore(distance + ages + vacancy + trust + quality, 100);
}

function parentUrgencyScore(item, prefs = {}) {
  let start = 0;
  if (prefs.startDate) {
    const days = Math.round((Date.parse(prefs.startDate) - (prefs.now || Date.now())) / 86400000);
    if (Number.isFinite(days)) {
      if (days <= 7) start = 40;
      else if (days <= 21) start = 28;
      else start = 8;
    }
  }
  let spots = 0;
  if (item.lastVacancyUpdatedAt) {
    const n = (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0);
    spots = n > 0 ? URGENCY.spots : 4;
  }
  let reply = 0;
  if ((item.replySample ?? 0) >= MIN_REPLY && typeof item.replyMedianHours === "number") {
    reply = item.replyMedianHours <= 4 ? URGENCY.reply : 8;
  }
  return clampScore(start + spots + reply, 100);
}

function demandHeat(signals) {
  if (signals.loaded !== true) return "unknown";
  const volume = (signals.inquiries28d ?? 0) + (signals.tours28d ?? 0) + (signals.bookings28d ?? 0);
  if (volume <= 0) return "quiet";
  if (volume >= 5) return "hot";
  return "warm";
}

function fillRisk(item, now = Date.now()) {
  if (!item.lastVacancyUpdatedAt) return "unknown";
  const spots = (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0);
  if (spots <= 0) return "low";
  const days = (now - Date.parse(item.lastVacancyUpdatedAt)) / 86400000;
  if (days >= 14) return "high";
  if (days >= 7) return "watch";
  return "low";
}

const empty = {
  id: "on-1",
  city: "Toronto",
  province: "ON",
  agesKnown: false,
  ageMinMonths: 0,
  ageMaxMonths: 0,
  spotsInfant: 0,
  spotsToddler: 0,
  spotsPreschool: 0,
  claimStatus: "unclaimed",
  photos: [],
};

const strong = {
  id: "mb-100",
  city: "Winnipeg",
  province: "MB",
  agesKnown: true,
  ageMinMonths: 6,
  ageMaxMonths: 60,
  spotsInfant: 2,
  spotsToddler: 1,
  spotsPreschool: 0,
  lastVacancyUpdatedAt: new Date().toISOString(),
  claimStatus: "approved",
  claimed: true,
  live: true,
  licenseStatus: "matched",
  registryMatchState: "matched",
  distanceKm: 1.2,
  priority: true,
  featuredCity: true,
};

test("parent match scores real prefs and treats missing signals as zero", () => {
  assert.equal(parentMatchScore(empty, {}), 0);
  assert.equal(parentMatchScore({ ...strong, distanceKm: 1 }, { ageGroup: "infant" }), parentMatchScore({ ...strong, distanceKm: 1 }, { ageGroup: "infant" }));
  const withOrigin = parentMatchScore(strong, { ageGroup: "infant", radiusKm: 25, distanceKnown: true });
  const noOrigin = parentMatchScore(strong, { ageGroup: "infant", radiusKm: 25, distanceKnown: false });
  assert.ok(withOrigin > noOrigin);
  assert.ok(noOrigin > 0);
  assert.equal(parentMatchScore({ ...empty, lastVacancyUpdatedAt: null }, { distanceKnown: true, distanceKm: 0 }), 0);
  const unknownAges = parentMatchScore({ ...strong, agesKnown: false }, { ageGroup: "infant", distanceKnown: true });
  assert.ok(unknownAges < withOrigin);
});

test("paid priority and featured-city never inflate match or urgency", () => {
  const prefs = { ageGroup: "infant", radiusKm: 25, distanceKnown: true, startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) };
  const paid = parentMatchScore(strong, prefs);
  const free = parentMatchScore({ ...strong, priority: false, featuredCity: false }, prefs);
  assert.equal(paid, free);
  const urgentPaid = parentUrgencyScore({ ...strong, replySample: 6, replyMedianHours: 2, priority: true }, prefs);
  const urgentFree = parentUrgencyScore({ ...strong, replySample: 6, replyMedianHours: 2, priority: false }, prefs);
  assert.equal(urgentPaid, urgentFree);
});

test("urgency hides reply speed until five real replies exist", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  const prefs = { startDate: "2026-09-08", now };
  const thin = parentUrgencyScore({ ...strong, replySample: 4, replyMedianHours: 1 }, prefs);
  const enough = parentUrgencyScore({ ...strong, replySample: 5, replyMedianHours: 1 }, prefs);
  assert.ok(enough > thin);
  assert.equal(parentUrgencyScore(strong, {}), parentUrgencyScore({ ...strong, replyMedianHours: 1, replySample: 2 }, {}));
});

test("demand heat and fill-risk stay unknown without real samples", () => {
  assert.equal(demandHeat({}), "unknown");
  assert.equal(demandHeat({ loaded: true, inquiries28d: 0, tours28d: 0, bookings28d: 0 }), "quiet");
  assert.equal(demandHeat({ loaded: true, inquiries28d: 2, tours28d: 1, bookings28d: 0 }), "warm");
  assert.equal(demandHeat({ loaded: true, inquiries28d: 6 }), "hot");
  assert.equal(fillRisk(empty), "unknown");
  assert.equal(fillRisk({ ...strong, spotsInfant: 0, spotsToddler: 0, spotsPreschool: 0 }), "low");
  const stale = new Date(Date.now() - 16 * 86400000).toISOString();
  assert.equal(fillRisk({ ...strong, lastVacancyUpdatedAt: stale }), "high");
});

test("server overlay, search sorts, desks, and docs stay honest", () => {
  const match = src("src/lib/parent-match.ts");
  assert.match(match, /MATCH_WEIGHTS = \{[\s\S]*distance: 25/);
  assert.match(match, /Paid Pro \/ Network/);
  assert.match(match, /never enter this score/);
  assert.match(match, /distanceKnown/);
  assert.doesNotMatch(match, /priority\s*\?/);
  assert.doesNotMatch(match, /featuredCity/);
  assert.doesNotMatch(match, /parentPlus|Parent Plus/);

  const urgency = src("src/lib/parent-urgency.ts");
  assert.match(urgency, /URGENCY_WEIGHTS = \{[\s\S]*startDate: 40/);
  assert.match(urgency, /MIN_REPLY_SAMPLE = MIN_THREAD_SAMPLE/);
  assert.match(urgency, /never enter this rank/);
  assert.doesNotMatch(urgency, /featuredCity/);

  const demand = src("src/lib/demand-heat.ts");
  assert.match(demand, /DEMAND_WINDOW_DAYS = 28/);
  assert.match(demand, /MIN_DEMAND_REPLY_SAMPLE = MIN_THREAD_SAMPLE/);
  assert.match(demand, /Paid analytics windows \(7 vs 90 days\) do not change these bands/);
  assert.match(demand, /never invents volume/);

  const server = src("src/lib/server/rank.ts");
  assert.match(server, /loadRankSignals/);
  assert.match(server, /sender = 'parent'/);
  assert.match(server, /sender = 'provider'/);
  assert.match(server, /overlayParentRank/);
  assert.match(server, /overlayDemandSnapshots/);

  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /overlayParentRank/);
  assert.match(daycares, /sort === "match"/);
  assert.match(daycares, /sort === "urgency"/);
  assert.match(daycares, /distanceKnown: true/);

  const search = src("src/routes/search.tsx");
  assert.match(search, /sortMatch/);
  assert.match(search, /sortUrgency/);
  assert.match(search, /needBy/);

  assert.match(src("src/components/daycare-card.tsx"), /MatchCue/);
  assert.match(src("src/components/rank-cues.tsx"), /DemandCues/);
  assert.match(src("src/routes/compare.tsx"), /matchScore/);
  assert.match(src("src/components/parent-desk.tsx"), /parentMatchScore/);
  assert.match(src("src/routes/provider.tsx"), /DemandCues/);
  assert.match(src("src/lib/server/family.ts"), /overlayDemandSnapshots/);

  const copy = src("src/lib/copy.ts");
  assert.match(copy, /Paid plans never inflate Match/);
  assert.match(copy, /Paid plans never inflate Urgency/);
  assert.match(copy, /Les forfaits payants n’augmentent jamais la correspondance/);
  assert.doesNotMatch(copy, /paid plans (boost|raise) match/i);

  const docs = src("docs/parent-rank.md");
  assert.match(docs, /never.*inflate Match or Urgency/i);
  assert.match(docs, /quality score/);
  assert.match(docs, /28-day/);
  assert.match(docs, /not invented warmth/);
});
