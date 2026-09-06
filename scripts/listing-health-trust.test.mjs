import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const FEE_PROGRAM = new Set(["MB", "SK", "PE", "NL", "YT", "NT", "NU", "QC", "AB"]);
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

function isRealListingPhoto(srcPath) {
  const p = (srcPath || "").trim();
  if (!p) return false;
  if (p.includes("placeholder") || p.includes("-logo") || p.includes("/photos/wpg/")) return false;
  if (p.startsWith("data:image") || p.startsWith("/photos/buildings/") || p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

function listingHealth(d) {
  const vacancyAt = d.lastVacancyUpdatedAt ?? d.spotsUpdatedAt ?? null;
  const missing = [];
  const hasFees = FEE_PROGRAM.has(d.province) || [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly].some((n) => n != null && n > 0);
  const hasAges = Boolean(d.agesKnown) || (d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0);
  const hours = (d.hours || "").trim();
  const hasHours = hours.length >= 4 && hours !== "—";
  const hasPhoto = (d.photos ?? []).some((p) => isRealListingPhoto(p));
  if (!hasFees) missing.push("fees");
  if (!hasAges) missing.push("ages");
  if (!hasPhoto) missing.push("photo");
  if (!hasHours) missing.push("hours");
  if (!vacancyAt) missing.push("vacancy");
  const total = 5;
  const score = total - missing.length;
  return { score, total, percent: Math.round((score / total) * 100), missing, vacancyAt };
}

function vacancyFreshness(updatedAt, now = Date.now()) {
  if (!updatedAt) return { kind: "unknown" };
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return { kind: "unknown" };
  return { kind: now - ts > STALE_MS ? "stale" : "fresh" };
}

function isClaimVerified(item) {
  const raw = (item.claimStatus || "").trim().toLowerCase();
  if (raw === "unclaimed" || (!raw && !item.claimed && !item.claimedAt)) return false;
  return ["approved", "live", "active", "published"].includes(raw) || Boolean(item.live && item.claimed);
}

const empty = {
  province: "ON",
  infantMonthly: 0,
  toddlerMonthly: 0,
  preschoolMonthly: 0,
  agesKnown: false,
  ageMinMonths: 0,
  ageMaxMonths: 0,
  hours: "",
  photos: [],
  lastVacancyUpdatedAt: null,
  spotsUpdatedAt: null,
};

test("Kyle-approved trust labels are the only public badge words", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /trustLicensedMatched: "Licensed"/);
  assert.match(copy, /trustLicenseUnverified: "Unverified"/);
  assert.match(copy, /trustClaimVerified: "Claim verified"/);
  assert.match(copy, /trustStaffAttested: "Staff attested"/);
  assert.doesNotMatch(copy, /KidEase background-checked/);
  assert.doesNotMatch(copy, /Background checked by KidEase/);
  assert.doesNotMatch(copy, /Owner claim verified/);
  assert.doesNotMatch(copy, /Staff screening: provider-attested/);
});

test("badge meaning is shared: cards, listing, compare, provider, admin", () => {
  const trust = src("src/lib/trust.ts");
  assert.match(trust, /labelKey: "trustLicensedMatched"/);
  assert.match(trust, /labelKey: "trustLicenseUnverified"/);
  assert.match(trust, /labelKey: "trustClaimVerified"/);
  assert.match(trust, /labelKey: "trustStaffAttested"/);
  assert.match(trust, /claim\.id === "claim_verified"/);
  assert.match(trust, /staff\.id === "staff_attested"/);
  assert.match(src("src/components/daycare-card.tsx"), /surface="card"/);
  assert.match(src("src/routes/compare.tsx"), /TrustSignals/);
  assert.match(src("src/routes/compare.tsx"), /compareTrust/);
  assert.match(src("src/components/listing-badges.tsx"), /TrustSignals/);
  assert.match(src("src/routes/provider.tsx"), /TrustSignals/);
  assert.match(src("src/components/admin-trust.tsx"), /TrustSignals/);
  assert.match(src("src/components/map-view.tsx"), /TrustSignals/);
});

test("listing health scores real fields and never invents a vacancy time", () => {
  const blank = listingHealth(empty);
  assert.equal(blank.percent, 0);
  assert.deepEqual(blank.missing, ["fees", "ages", "photo", "hours", "vacancy"]);
  assert.equal(blank.vacancyAt, null);
  assert.equal(vacancyFreshness(null).kind, "unknown");

  const filled = listingHealth({
    ...empty,
    province: "MB",
    agesKnown: true,
    ageMinMonths: 12,
    ageMaxMonths: 60,
    hours: "Monday to Friday 7:00–18:00",
    photos: ["/photos/buildings/mb-1.jpg"],
    lastVacancyUpdatedAt: "2026-09-01T12:00:00.000Z",
  });
  assert.equal(filled.percent, 100);
  assert.equal(filled.missing.length, 0);
  assert.equal(filled.vacancyAt, "2026-09-01T12:00:00.000Z");

  const readiness = src("src/lib/listing-readiness.ts");
  assert.match(readiness, /HEALTH_FIELDS = \["fees", "ages", "photo", "hours", "vacancy"\]/);
  assert.match(readiness, /if \(!vacancyAt\) missing\.push\("vacancy"\)/);
  assert.doesNotMatch(readiness, /lastVacancyUpdatedAt: new Date/);

  const forms = src("src/components/provider-listing-forms.tsx");
  assert.match(forms, /ListingHealthPanel/);
  assert.match(forms, /listing-health-fees/);
  assert.match(forms, /listing-health-ages/);
  assert.match(forms, /listing-health-photo/);
  assert.match(forms, /listing-health-hours/);
  assert.match(forms, /listing-health-vacancy/);
  const panel = src("src/components/listing-health.tsx");
  assert.match(panel, /listingHealthTitle/);
  assert.match(panel, /listingHealthEdit/);
  assert.match(panel, /listingHealthConfirmSpots/);
  assert.match(panel, /scrollIntoView/);
});

test("quality ranking prefers claim verified, fresh vacancy, completeness — incomplete stay searchable", () => {
  assert.equal(isClaimVerified({ claimStatus: "unclaimed" }), false);
  assert.equal(isClaimVerified({ claimStatus: "approved", claimed: true }), true);
  const incomplete = listingHealth(empty).percent;
  const better = listingHealth({
    ...empty,
    infantMonthly: 1200,
    agesKnown: true,
    ageMinMonths: 12,
    ageMaxMonths: 60,
    hours: "Monday to Friday 7:00–18:00",
    photos: ["/photos/buildings/on-100.jpg"],
    lastVacancyUpdatedAt: new Date().toISOString(),
  }).percent;
  assert.ok(better > incomplete);

  const search = src("src/routes/search.tsx");
  assert.match(search, /filterClaimVerified/);
  assert.match(search, /sortRecommended/);
  assert.match(search, /isClaimVerified/);
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /listingQualityScore/);
  assert.match(daycares, /recommended/);
  assert.match(src("src/lib/proximity.ts"), /listingQualityBoost/);
  assert.match(src("src/lib/listing-readiness.ts"), /Incomplete listings stay in the set/);
});

test("claim status changes write listing_trust_events without loosening admin gates", () => {
  const admin = src("src/lib/server/admin-centres.ts");
  assert.match(admin, /writeTrustEvent/);
  assert.match(admin, /claim_\$\{claimStatus\}/);
  assert.match(admin, /requireOperator/);
  const claims = src("src/lib/server/claims.ts");
  assert.match(claims, /kind: "claim_pending"/);
  assert.match(claims, /kind: "claim_waiting"/);
  const trust = src("src/lib/server/trust.ts");
  assert.match(trust, /export async function writeTrustEvent/);
  assert.match(trust, /listing_trust_events/);
  assert.match(trust, /requireAdmin/);
});
