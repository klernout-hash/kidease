import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const PHOTO_STALE_MS = 90 * 24 * 60 * 60 * 1000;

function photoFreshness(updatedAt, now = Date.now()) {
  if (!updatedAt) return { kind: "unknown" };
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return { kind: "unknown" };
  return { kind: now - ts > PHOTO_STALE_MS ? "stale" : "fresh" };
}

function listingQualityScore(item) {
  let score = 0;
  if (item.claimStatus === "approved") score += 3;
  if (item.lastVacancyUpdatedAt) score += 2;
  score += item.completeScore ?? 0;
  if (photoFreshness(item.lastPhotoUpdatedAt).kind === "stale") score = Math.max(0, score - 1);
  return score;
}

function freshnessWithPhoto(vacancyKind, photoKind) {
  let score = vacancyKind === "fresh" ? 15 : vacancyKind === "stale" ? 4 : 0;
  if (photoKind === "stale") score = Math.max(0, score - 3);
  return score;
}

const STAGE_RANK = { inquiry: 0, tour_pending: 1, tour_accepted: 2, enrol_open: 3, enrolled: 4 };
const OPEN_ENROL = new Set(["requested", "under_review", "waitlist"]);
const ENROLLED = new Set(["accepted", "active"]);

function pipelineStageFor(row) {
  if (row.kind === "booking") {
    if (ENROLLED.has(row.bookingStatus)) return "enrolled";
    if (OPEN_ENROL.has(row.bookingStatus)) return "enrol_open";
    return null;
  }
  if (row.kind === "tour") {
    if (row.tourStatus === "pending") return "tour_pending";
    if (row.tourStatus === "accepted") return "tour_accepted";
    return null;
  }
  if (row.kind === "conversation") return "inquiry";
  return null;
}

function assignPipeline(rows) {
  const best = new Map();
  for (const row of rows) {
    const stage = pipelineStageFor(row);
    if (!stage) continue;
    const key = `${row.daycareId}:${row.parentUserId}`;
    const cur = best.get(key);
    if (!cur || STAGE_RANK[stage] > STAGE_RANK[cur.stage]) best.set(key, { ...row, stage });
  }
  return [...best.values()];
}

test("photo freshness is unknown without a stamp and stale after 90 days", () => {
  assert.equal(photoFreshness(null).kind, "unknown");
  assert.equal(photoFreshness("not-a-date").kind, "unknown");
  const now = Date.parse("2026-09-07T00:00:00.000Z");
  assert.equal(photoFreshness("2026-08-01T00:00:00.000Z", now).kind, "fresh");
  assert.equal(photoFreshness("2026-05-01T00:00:00.000Z", now).kind, "stale");
  assert.equal(freshnessWithPhoto("fresh", "unknown"), 15);
  assert.equal(freshnessWithPhoto("fresh", "stale"), 12);
  assert.equal(freshnessWithPhoto("unknown", "stale"), 0);
});

test("legacy listingQualityScore never adds paid priority", () => {
  const paid = listingQualityScore({
    claimStatus: "approved",
    lastVacancyUpdatedAt: "2026-09-01T00:00:00.000Z",
    completeScore: 5,
    priority: true,
  });
  const free = listingQualityScore({
    claimStatus: "approved",
    lastVacancyUpdatedAt: "2026-09-01T00:00:00.000Z",
    completeScore: 5,
    priority: false,
  });
  assert.equal(paid, free);
  const stale = listingQualityScore({
    claimStatus: "approved",
    lastVacancyUpdatedAt: "2026-09-01T00:00:00.000Z",
    completeScore: 5,
    lastPhotoUpdatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(stale < paid);
});

test("pipeline keeps the highest real stage and drops declined tours", () => {
  const cards = assignPipeline([
    { id: "cv1", kind: "conversation", daycareId: "d1", parentUserId: "u1" },
    { id: "t1", kind: "tour", daycareId: "d1", parentUserId: "u1", tourStatus: "accepted" },
    { id: "b1", kind: "booking", daycareId: "d1", parentUserId: "u1", bookingStatus: "requested" },
    { id: "t2", kind: "tour", daycareId: "d1", parentUserId: "u2", tourStatus: "declined" },
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].stage, "enrol_open");
  assert.equal(pipelineStageFor({ kind: "tour", tourStatus: "declined" }), null);
});

test("admin verify, alerts, demotion, and CRM stay code-only and honest", () => {
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /Licence and photo review/);
  assert.match(admin, /c\.licensePhoto/);
  assert.match(admin, /needsVerification/);
  assert.match(src("src/lib/admin-verify.ts"), /needsLicenseReview/);
  assert.match(src("src/lib/desk-nav.ts"), /id: "verify"/);

  const alerts = src("src/lib/server/search-alerts.ts");
  assert.match(alerts, /api\.resend\.com\/emails/);
  assert.match(alerts, /email stub — no RESEND_API_KEY/);
  assert.match(alerts, /text\/html/);
  assert.doesNotMatch(alerts, /TODO: wire Resend/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /alertEmailStub/);
  assert.match(src("src/lib/saved-search.ts"), /emailConfigured/);

  const readiness = src("src/lib/listing-readiness.ts");
  assert.match(readiness, /PHOTO_STALE_MS/);
  assert.match(readiness, /lastPhotoUpdatedAt/);
  assert.doesNotMatch(readiness, /if \(item\.priority\) score \+= 1/);
  assert.match(src("src/lib/quality.ts"), /photo_stale/);
  assert.match(src("src/lib/quality.ts"), /score - 3/);
  assert.doesNotMatch(src("src/lib/quality.ts"), /item\.priority/);
  assert.match(src("migrations/0032_photo_freshness.sql"), /last_photo_updated_at/);
  assert.match(src("migrations/0032_photo_freshness.sql"), /Never invented/);
  assert.match(src("src/lib/server/claims.ts"), /last_photo_updated_at/);
  assert.match(src("src/lib/server/family.ts"), /last_photo_updated_at/);

  const crm = src("src/lib/crm-pipeline.ts");
  assert.match(crm, /PIPELINE_STAGES/);
  assert.match(crm, /Does not invent bookings/);
  assert.match(crm, /convert a tour into enrolment/);
  assert.match(src("src/routes/provider.tsx"), /CentrePipeline/);
  assert.match(src("src/components/tour-card.tsx"), /tour.status === "accepted"/);
  assert.match(src("src/components/tour-card.tsx"), /\/book\/\$slug/);

  assert.doesNotMatch(src("src/lib/quality.ts"), /selected_plan/);
  assert.doesNotMatch(src("src/lib/listing-readiness.ts"), /featuredCity/);
  assert.doesNotMatch(admin, /ca_/);
});
