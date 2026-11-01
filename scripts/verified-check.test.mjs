import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { publicApprovalEligible } from "../src/lib/approve-live.ts";
import { copy } from "../src/lib/copy.ts";
import { loadExtraCopy } from "../src/lib/extra-copy.ts";
import { geocode } from "../src/lib/geo.ts";
import { isListingVerified, showVerifiedCheck } from "../src/lib/listing-verified.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const winnipeg = geocode("Winnipeg");

/** Published Kids World facts. Screening is the centre's own statement, not a cleared VSC. */
const kidsWorld = {
  id: "kids-world-daycare-kh2t",
  daycareId: "kids-world-daycare-kh2t",
  slug: "kids-world-daycare-kh2t",
  name: "Kids World Daycare",
  city: "Edmonton",
  province: "AB",
  lat: winnipeg?.lat,
  lng: winnipeg?.lng,
  licenseNumber: "70051797",
  licenseStatus: "matched",
  licenseVerificationSource: "admin",
  claimStatus: "approved",
  claimedAt: "2026-09-01",
  listingActive: true,
  live: true,
  ratingX10: 0,
  reviewCount: 0,
  hours: "7:00 a.m. – 5:30 p.m., Monday to Friday",
  agesKnown: true,
  ageMinMonths: 12,
  ageMaxMonths: 60,
  infantMonthly: 326.25,
  toddlerMonthly: 326.25,
  preschoolMonthly: 326.25,
  licensedCapacity: null,
  photos: [],
  screeningOnFile: false,
  staffScreeningAttested: true,
};

const ready = {
  ...kidsWorld,
  licensedCapacity: 16,
  photos: ["/photos/buildings/kids-world.jpg"],
  screeningOnFile: true,
};

test("Kids World keeps Approved by KidEase and hides the check until a cleared VSC is on file", () => {
  assert.ok(winnipeg);
  assert.equal(publicApprovalEligible(kidsWorld), true);
  assert.equal(showVerifiedCheck(kidsWorld), false);
  assert.equal(isListingVerified(kidsWorld), false);
  assert.equal(
    showVerifiedCheck({ ...kidsWorld, staffScreeningAttested: true, screeningOnFile: false }),
    false,
  );
});

test("the blue check reuses the eight-item rule and an approved claim", () => {
  assert.equal(isListingVerified(ready), true);
  assert.equal(showVerifiedCheck(ready), true);
  assert.equal(showVerifiedCheck({ ...ready, screeningOnFile: false, staffScreeningAttested: true }), false);
  assert.equal(showVerifiedCheck({ ...ready, claimStatus: "waiting" }), false);
  assert.equal(showVerifiedCheck({ ...ready, claimStatus: "" }), false);
  assert.equal(showVerifiedCheck({ ...ready, hours: "" }), false);
  assert.equal(showVerifiedCheck({ ...ready, photos: [] }), false);
  assert.equal(showVerifiedCheck({ ...ready, licensedCapacity: null }), false);
  assert.equal(showVerifiedCheck({ ...ready, licenseStatus: "expired" }), false);
  assert.equal(showVerifiedCheck({ ...ready, agesKnown: false, ageMinMonths: 0, ageMaxMonths: 0 }), false);

  const model = src("src/lib/listing-verified.ts");
  const start = model.indexOf("export function showVerifiedCheck");
  const fn = model.slice(start, model.indexOf("export function listingCoachDesks"));
  assert.match(fn, /isListingVerified\(input\)/);
  assert.match(fn, /claimIsApproved\(input\.claimStatus\)/);
  assert.doesNotMatch(fn, /staffScreeningAttested/);
});

test("the check sits beside Live, KidEase approved, and Approved by KidEase", () => {
  const card = src("src/components/daycare-card.tsx");
  const map = src("src/components/map-view.tsx");
  const page = src("src/routes/daycare.$slug.tsx");
  const icon = src("src/components/verified-check.tsx");
  const calls = [...card.matchAll(/<CardPhotoBadges[\s\S]*?\/>/g)];
  assert.equal(calls.length, 2);
  assert.match(calls[0][0], /verifiedCheck=\{showVerifiedCheck\(item\)\}/);
  assert.doesNotMatch(calls[1][0], /verifiedCheck/);
  const pillsAt = card.indexOf('data-ke="card-photo-pills"');
  const pills = card.slice(pillsAt, pillsAt + 420);
  assert.match(pills, /data-ke="card-live-pill"[\s\S]*<VerifiedCheck/);
  assert.match(card, /showCardLivePill\(live, publicApprovalEligible\(item\)\)/);

  const marker = map.slice(map.indexOf("kidease-approved-marker") - 280, map.indexOf("kidease-approved-marker") + 220);
  assert.match(marker, /approvedLabel/);
  assert.match(marker, /<VerifiedCheck/);
  assert.match(map, /showVerifiedCheck\(item\)/);
  assert.match(map, /publicApprovalEligible\(item\)/);

  const line = page.slice(page.indexOf('data-ke="listing-trust-line"'), page.indexOf('data-ke="listing-trust-line"') + 520);
  assert.match(line, /KidEaseApprovalStrip/);
  assert.match(line, /<VerifiedCheck/);
  assert.match(page, /showVerifiedCheck\(d\)/);
  assert.match(page, /publicApprovalEligible\(d\)/);

  assert.match(icon, /BadgeCheck/);
  assert.match(icon, /text-primary/);
  assert.match(icon, /aria-label=\{label\}/);
  assert.match(icon, /title=\{label\}/);
  assert.match(icon, /verifiedCheckLabel/);
  assert.doesNotMatch(icon, /Listing Verified|bg-\[#22C55E\]|bg-ok/);
  assert.doesNotMatch(`${card}\n${map}\n${page}`, /listing-verified-pill|ListingVerifiedPill/);
});

test("the check label is in all 10 languages and does not claim a government endorsement", async () => {
  const en = "Verified by KidEase: licence and background check checked";
  assert.equal(copy.en.verifiedCheckLabel, en);
  assert.notEqual(copy.fr.verifiedCheckLabel, en);
  assert.match(copy.fr.verifiedCheckLabel, /KidEase/);
  const banned = /government|gouvernement|endorsed by the province|gobierno|governo/i;
  assert.doesNotMatch(copy.en.verifiedCheckLabel, banned);
  assert.doesNotMatch(copy.fr.verifiedCheckLabel, banned);
  for (const code of ["zh", "yue", "pa", "es", "ar", "tl", "it", "de"]) {
    const pack = await loadExtraCopy(code);
    assert.equal(typeof pack.verifiedCheckLabel, "string", code);
    assert.ok(pack.verifiedCheckLabel.trim(), code);
    assert.notEqual(pack.verifiedCheckLabel, en, code);
    assert.doesNotMatch(pack.verifiedCheckLabel, banned);
  }
});
