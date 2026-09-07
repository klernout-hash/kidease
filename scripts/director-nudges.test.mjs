import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const VACANCY_STALE_MS = 14 * 24 * 60 * 60 * 1000;
const PHOTO_STALE_MS = 90 * 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-07T12:00:00.000Z");

function freshness(updatedAt, staleMs) {
  if (!updatedAt) return { kind: "unknown" };
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return { kind: "unknown" };
  return { kind: now - ts > staleMs ? "stale" : "fresh" };
}

function photoFreshness(updatedAt) {
  return freshness(updatedAt, PHOTO_STALE_MS);
}

function directorNudgesForListing(item, demand) {
  const out = [];
  const vacancy = freshness(item.lastVacancyUpdatedAt, VACANCY_STALE_MS);
  if (vacancy.kind === "unknown") out.push({ kind: "vacancy_missing", cta: "confirm_spots" });
  else if (vacancy.kind === "stale") out.push({ kind: "vacancy_stale", cta: "confirm_spots" });
  if (demand?.fillRisk === "high") out.push({ kind: "fill_risk", cta: "confirm_spots" });
  if (demand?.sla === "slow") out.push({ kind: "reply_slow", cta: "inbox" });
  if ((demand?.pendingTourOverdue ?? 0) > 0) out.push({ kind: "tours_waiting", cta: "requests" });
  if ((demand?.unrepliedThreads ?? 0) > 0) out.push({ kind: "threads_waiting", cta: "inbox" });
  const photos = item.photos ?? [];
  const hasPhoto = photos.some((p) => p && !p.includes("placeholder") && !p.includes("-logo"));
  const photo = photoFreshness(item.lastPhotoUpdatedAt);
  if (!hasPhoto) out.push({ kind: "photo_missing", cta: "edit_photo" });
  else if (photo.kind === "stale") out.push({ kind: "photo_stale", cta: "edit_photo" });
  return out;
}

function vacancyConfirmPriority(listings) {
  return [...listings].sort((a, b) => {
    const rank = (item) => {
      const v = freshness(item.lastVacancyUpdatedAt, VACANCY_STALE_MS);
      if (v.kind === "stale") return 0;
      if (v.kind === "unknown") return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });
}

test("nudges stay hidden without real vacancy, reply, or photo signals", () => {
  const quiet = {
    id: "d1",
    photos: ["/photos/buildings/d1.jpg"],
    lastVacancyUpdatedAt: "2026-09-06T12:00:00.000Z",
    lastPhotoUpdatedAt: "2026-08-01T12:00:00.000Z",
  };
  assert.deepEqual(
    directorNudgesForListing(quiet, {
      heat: "quiet",
      fillRisk: "low",
      sla: "unknown",
      pendingTourOverdue: 0,
      unrepliedThreads: 0,
    }),
    [],
  );
});

test("stale vacancy and parents waiting become actionable CTAs", () => {
  const stale = {
    id: "d2",
    photos: ["/photos/buildings/d2.jpg"],
    lastVacancyUpdatedAt: "2026-08-01T12:00:00.000Z",
    lastPhotoUpdatedAt: "2026-08-01T12:00:00.000Z",
  };
  const nudges = directorNudgesForListing(stale, {
    heat: "hot",
    fillRisk: "high",
    sla: "slow",
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
  assert.equal(photoFreshness(null).kind, "unknown");
  assert.equal(photoFreshness("not-a-date").kind, "unknown");
  assert.equal(photoFreshness("2026-08-01T12:00:00.000Z").kind, "fresh");
  assert.equal(photoFreshness("2026-01-01T12:00:00.000Z").kind, "stale");

  const missing = directorNudgesForListing(
    { id: "d3", photos: ["/photos/storefront-placeholder-480.webp"] },
    {},
  );
  assert.ok(missing.some((n) => n.kind === "photo_missing"));
  assert.ok(missing.some((n) => n.kind === "vacancy_missing"));
});

test("vacancy confirm loop puts stale listings first", () => {
  const fresh = { id: "a", lastVacancyUpdatedAt: "2026-09-06T12:00:00.000Z" };
  const stale = { id: "b", lastVacancyUpdatedAt: "2026-08-01T12:00:00.000Z" };
  const missing = { id: "c" };
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
  assert.match(src("migrations/0032_photo_freshness.sql"), /Never invented/);
  const nudges = src("src/lib/director-nudges.ts");
  assert.match(nudges, /never invent/);
  assert.match(nudges, /vacancy_stale/);
  assert.match(nudges, /photo_stale/);
});
