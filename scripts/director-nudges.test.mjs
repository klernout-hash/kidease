import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectDirectorNudges, directorNudgesForListing, vacancyConfirmPriority } from "../src/lib/director-nudges.ts";
import { photoFreshness } from "../src/lib/listing-readiness.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const now = Date.parse("2026-09-07T12:00:00.000Z");

test("nudges stay hidden without real vacancy, reply, or photo signals", () => {
  const quiet = {
    id: "d1",
    name: "Quiet Centre",
    photos: ["/photos/buildings/d1.jpg"],
    lastVacancyUpdatedAt: "2026-09-06T12:00:00.000Z",
    lastPhotoUpdatedAt: "2026-08-01T12:00:00.000Z",
  };
  assert.deepEqual(
    directorNudgesForListing(quiet, {
      heat: "quiet",
      fillRisk: "low",
      sla: "unknown",
      volume28d: 0,
      inquiries28d: 0,
      tours28d: 0,
      bookings28d: 0,
      vacancyAgeDays: 1,
      replyMedianHours: null,
      replySample: 2,
      pendingTourOverdue: 0,
      unrepliedThreads: 0,
    }),
    [],
  );
});

test("stale vacancy and parents waiting become actionable CTAs", () => {
  const stale = {
    id: "d2",
    name: "Stale Centre",
    photos: ["/photos/buildings/d2.jpg"],
    lastVacancyUpdatedAt: "2026-08-01T12:00:00.000Z",
    lastPhotoUpdatedAt: "2026-08-01T12:00:00.000Z",
  };
  const nudges = directorNudgesForListing(stale, {
    heat: "hot",
    fillRisk: "high",
    sla: "slow",
    volume28d: 8,
    inquiries28d: 4,
    tours28d: 2,
    bookings28d: 2,
    vacancyAgeDays: 20,
    replyMedianHours: 40,
    replySample: 6,
    pendingTourOverdue: 2,
    unrepliedThreads: 3,
  });
  const kinds = nudges.map((n) => n.kind);
  assert.ok(kinds.includes("vacancy_stale"));
  assert.ok(kinds.includes("fill_risk"));
  assert.ok(kinds.includes("reply_slow"));
  assert.ok(kinds.includes("tours_waiting"));
  assert.ok(kinds.includes("threads_waiting"));
  assert.equal(nudges.find((n) => n.kind === "tours_waiting")?.cta, "requests");
  assert.equal(nudges.find((n) => n.kind === "vacancy_stale")?.cta, "confirm_spots");
});

test("photo freshness never invents a date; stale photos demote softly", () => {
  assert.equal(photoFreshness(null, now).kind, "unknown");
  assert.equal(photoFreshness("not-a-date", now).kind, "unknown");
  assert.equal(photoFreshness("2026-08-01T12:00:00.000Z", now).kind, "fresh");
  assert.equal(photoFreshness("2026-01-01T12:00:00.000Z", now).kind, "stale");

  const missing = collectDirectorNudges(
    [{ id: "d3", name: "Blank", photos: ["/photos/storefront-placeholder-480.webp"] }],
    [],
  );
  assert.ok(missing.some((n) => n.kind === "photo_missing"));
  assert.ok(missing.some((n) => n.kind === "vacancy_missing"));
});

test("vacancy confirm loop puts stale listings first", () => {
  const fresh = { id: "a", name: "A", lastVacancyUpdatedAt: "2026-09-06T12:00:00.000Z" };
  const stale = { id: "b", name: "B", lastVacancyUpdatedAt: "2026-08-01T12:00:00.000Z" };
  const missing = { id: "c", name: "C" };
  assert.deepEqual(
    vacancyConfirmPriority([fresh, missing, stale]).map((d) => d.id),
    ["b", "c", "a"],
  );
});

test("centre desk shows nudges and photo freshness without inventing dates", () => {
  assert.match(src("src/routes/provider.tsx"), /DirectorNudgeQueue/);
  assert.match(src("src/components/vacancy-confirm.tsx"), /vacancyConfirmPriority/);
  assert.match(src("src/components/daycare-card.tsx"), /photoLine/);
  assert.match(src("src/components/listing-health.tsx"), /photoFreshness/);
  assert.match(src("src/lib/quality.ts"), /photo_stale/);
  assert.match(src("src/lib/server/claims.ts"), /last_photo_updated_at/);
  assert.match(src("src/lib/listing-readiness.ts"), /PHOTO_STALE_MS/);
  assert.doesNotMatch(src("src/lib/listing-readiness.ts"), /lastPhotoUpdatedAt: new Date/);
  assert.match(src("migrations/0032_tour_pipeline_photo_freshness.sql"), /Never invented/);
});
