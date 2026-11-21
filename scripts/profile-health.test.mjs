import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HEALTH_WEIGHTS, compareHealth, licenceExpiryState, profileHealth } from "../src/lib/profile-health.ts";

const now = new Date("2026-11-17T12:00:00Z");
const full = {
  licenseNumber: "MB-4471",
  registryMatchState: "matched",
  licensePhoto: "private:licence.pdf",
  licenseExpiry: "2027-08-31",
  screeningOnFile: true,
  photoCount: 12,
  hasFees: true,
  hasAges: true,
  hasHours: true,
  phone: "204-555-0100",
  address: "12 Main St",
};
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("weights add to 100 and public-card facts weigh the most", () => {
  assert.equal(Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.ok(HEALTH_WEIGHTS.photos >= HEALTH_WEIGHTS.licence_file);
});

test("a complete profile scores 100 and is Ready", () => {
  const h = profileHealth(full, now);
  assert.equal(h.score, 100);
  assert.equal(h.ready, true);
  assert.equal(h.band, "ready");
  assert.equal(h.minimumMet, true);
  assert.ok(h.checks.every((c) => c.state === "good"));
});

test("fewer than 10 photos earns part credit and stops Ready", () => {
  const h = profileHealth({ ...full, photoCount: 6 }, now);
  const photos = h.checks.find((c) => c.id === "photos");
  assert.equal(photos.state, "warn");
  assert.equal(photos.points, 12);
  assert.match(photos.label.en, /6 of 10 photos/);
  assert.equal(h.score, 92);
  assert.equal(h.minimumMet, true, "1 photo is enough to approve with an override");
});

test("Approve minimum: 1 photo, valid licence, fees and ages", () => {
  assert.equal(profileHealth({ ...full, photoCount: 0 }, now).minimumMet, false);
  assert.equal(profileHealth({ ...full, hasFees: false }, now).minimumMet, false);
  assert.equal(profileHealth({ ...full, hasAges: false }, now).minimumMet, false);
  assert.equal(profileHealth({ ...full, licenseNumber: "" }, now).minimumMet, false);
  assert.equal(profileHealth({ ...full, licenseExpiry: "2026-01-01" }, now).minimumMet, false, "expired licence blocks");
  assert.equal(profileHealth({ ...full, licenseStatus: "suspended" }, now).minimumMet, false);
  const thin = profileHealth({ licenseNumber: "MB-1", photoCount: 1, hasFees: true, hasAges: true }, now);
  assert.equal(thin.minimumMet, true, "override allowed at the minimum");
  assert.equal(thin.ready, false);
});

test("licence expiry is green, amber under 60 days, red when past or missing", () => {
  assert.equal(licenceExpiryState("2027-08-31", now).state, "good");
  assert.equal(licenceExpiryState("2026-12-20", now).state, "warn");
  assert.equal(licenceExpiryState("2026-10-01", now).state, "missing");
  assert.equal(licenceExpiryState(null, now).state, "missing");
});

test("ready cards sort first, then by score", () => {
  const a = profileHealth(full, now);
  const b = profileHealth({ ...full, photoCount: 3 }, now);
  const c = profileHealth({ photoCount: 0 }, now);
  assert.deepEqual([c, b, a].sort(compareHealth).map((h) => h.score), [a.score, b.score, c.score]);
});

test("admin queue, Approve guard and daycare desk share one scoring path", () => {
  const admin = src("src/lib/server/admin-centres.ts") + src("src/lib/server/admin-centre-queue.ts");
  assert.match(admin, /healthFromDaycareRow\(/);
  assert.match(admin, /loadDaycareHealth\(sql, data\.daycareId\)/);
  assert.match(admin, /if \(!minimum\.minimumMet\)/);
  const desk = src("src/lib/server/profile-health.ts");
  assert.match(desk, /healthFromDaycareRow\(rows\[0\]\)/);
  assert.match(desk, /hasCentreDeskAccess/);
  const card = src("src/components/admin-review-card.tsx");
  assert.match(card, /disabled=\{locked \|\| !health\.minimumMet\}/);
  assert.match(card, /Approve anyway/);
  assert.match(src("src/routes/provider.tsx"), /<MyListingHealth/);
});
