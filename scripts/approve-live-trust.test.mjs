import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  adminLicenceFact,
  approvalHealthSummary,
  canOfferApprove,
  approvalScreeningFact,
  collapseDuplicateReviewCards,
  liveSearchHit,
  planApproval,
  hasLicenceEvidence,
  publicApprovalEligible,
  selectCanonicalClaim,
  showPublicClaimPrompt,
  verifiedSearchPoint,
} from "../src/lib/approve-live.ts";
import { isPlatformLive } from "../src/lib/live.ts";
import { flushSearchMemo, rememberSearch } from "../src/lib/server/search-memo.ts";
import { reviewDecisionFacts } from "../src/lib/admin-review-card.ts";
import { geocode } from "../src/lib/geo.ts";
import { listingStatusFromClaim } from "../src/lib/listing-status.ts";
import { normalizeAdminClaimStatus } from "../src/lib/listing-queue.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const edmonton = geocode("Edmonton");
const winnipeg = geocode("Winnipeg");

const kidsWorld = {
  id: "ab-kh2t",
  daycareId: "ab-kh2t",
  slug: "kids-world-daycare-kh2t",
  name: "Kids World Daycare",
  city: "Edmonton",
  province: "AB",
  lat: winnipeg.lat,
  lng: winnipeg.lng,
  licenseNumber: "70051797",
  licensePhoto: null,
  licenseStatus: "unverified",
  screeningOnFile: false,
  staffScreeningAttested: true,
  claimStatus: "waiting",
  claimedAt: null,
  listingActive: true,
  ratingX10: 0,
  reviewCount: 0,
};

test("Edmonton Live search includes Kids World once the pin is the verified city", () => {
  assert.ok(edmonton);
  assert.ok(winnipeg);
  const rawKm = Math.hypot(kidsWorld.lat - edmonton.lat, kidsWorld.lng - edmonton.lng);
  assert.ok(rawKm > 1, "stored Winnipeg pin is not an Edmonton search hit");

  const point = verifiedSearchPoint(kidsWorld);
  assert.equal(point.source, "city");
  assert.equal(point.eligible, true);
  assert.ok(Math.abs(point.lat - edmonton.lat) < 0.01);

  const unverified = liveSearchHit({
    origin: edmonton,
    radiusKm: 25,
    label: "Edmonton, AB",
    centre: { ...kidsWorld, claimStatus: "approved", claimedAt: "2026-09-01", lat: winnipeg.lat, lng: winnipeg.lng },
  });
  assert.equal(unverified, false, "approved without licence evidence is not an Edmonton Live hit");

  const before = liveSearchHit({
    origin: edmonton,
    radiusKm: 25,
    label: "Edmonton, AB",
    centre: {
      ...kidsWorld,
      claimStatus: "approved",
      claimedAt: "2026-09-01",
      licenseStatus: "matched",
      licenseVerificationSource: "admin",
      lat: winnipeg.lat,
      lng: winnipeg.lng,
    },
  });
  assert.equal(before, true, "verified location and licence evidence decide Live search");

  const outside = liveSearchHit({
    origin: edmonton,
    radiusKm: 25,
    label: "Edmonton, AB",
    centre: { ...kidsWorld, city: "Winnipeg", province: "MB", claimStatus: "approved", claimedAt: "2026-09-01" },
  });
  assert.equal(outside, false);

  const waiting = liveSearchHit({
    origin: edmonton,
    radiusKm: 25,
    label: "Edmonton, AB",
    centre: kidsWorld,
  });
  assert.equal(waiting, false);
});

test("approval requires licence and screening, then reports Live search and trust", () => {
  const claims = [
    { id: "cl-old", status: "pending", createdAt: "2026-08-01T00:00:00.000Z", licensePhoto: "licenses/private.pdf" },
    { id: "cl-new", status: "waiting", createdAt: "2026-09-01T00:00:00.000Z" },
  ];
  const chosen = selectCanonicalClaim(claims);
  assert.equal(chosen.canonicalId, "cl-new");
  assert.deepEqual(chosen.suppressIds, ["cl-old"]);

  const blocked = planApproval({ ...kidsWorld, staffScreeningAttested: false, screeningOnFile: false }, claims);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.next, null);
  assert.ok(blocked.health.failed.includes("screening"));
  assert.equal(approvalHealthSummary(blocked.health).title, "Approval did not complete");
  assert.match(approvalHealthSummary(blocked.health).body, /not marked Live/);

  const missingLicence = planApproval({ ...kidsWorld, licenseNumber: "" }, claims);
  assert.equal(missingLicence.ok, false);
  assert.ok(missingLicence.health.failed.includes("licence"));

  const duplicates = [
    {
      id: "ab-dup",
      daycareId: "ab-dup",
      name: "Kids World",
      city: "Edmonton",
      province: "AB",
      licenseNumber: null,
      claimStatus: "pending",
    },
  ];
  const plan = planApproval(kidsWorld, claims, duplicates);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.health.failed, []);
  assert.equal(plan.canonicalClaimId, "cl-new");
  assert.deepEqual(plan.suppressClaimIds, ["cl-old"]);
  assert.deepEqual(plan.suppressDaycareIds, ["ab-dup"]);
  assert.equal(plan.next.claimStatus, "approved");
  assert.equal(plan.next.licenseNumber, "70051797");
  assert.equal(plan.next.licenseVerificationSource, "admin");
  assert.equal(publicApprovalEligible(plan.next), true);
  assert.equal(approvalHealthSummary(plan.health).title, "Approval checks passed");
  assert.ok(plan.health.checks.some((check) => check.id === "search_memo" && check.ok));
  assert.ok(plan.health.checks.some((check) => check.id === "search_location" && check.ok));
  assert.ok(plan.health.checks.some((check) => check.id === "trust" && check.ok));
});

test("admin licence follows the public number instead of the private file", () => {
  const fact = adminLicenceFact({
    licenseNumber: "70051797",
    licensePhoto: null,
    licenseStatus: "unverified",
    daycareId: "ab-kh2t",
  });
  assert.equal(fact.status, "On file · 70051797");
  assert.equal(fact.tone, "ready");
  assert.notEqual(fact.status, "Missing");

  const card = reviewDecisionFacts({
    licenseNumber: "70051797",
    daycareId: "ab-kh2t",
    staffScreeningAttested: true,
  });
  assert.equal(card[0].status, "On file · 70051797");
  assert.equal(card[1].status, "Attested");
  assert.doesNotMatch(card.map((row) => row.status).join(" "), /pdf|licenses\/|storage_ref|data:application/i);
});

test("duplicate Kids World cards collapse and Live records cannot be approved again", () => {
  const rows = collapseDuplicateReviewCards([
    {
      daycareId: "ab-dup",
      name: "Kids World",
      city: "Edmonton",
      province: "AB",
      claimStatus: "pending",
      submittedAt: "2026-09-02T00:00:00.000Z",
    },
    {
      daycareId: "ab-kh2t",
      slug: "kids-world-daycare-kh2t",
      name: "Kids World Daycare",
      city: "Edmonton",
      province: "AB",
      licenseNumber: "70051797",
      claimStatus: "approved",
      live: true,
      submittedAt: "2026-08-01T00:00:00.000Z",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].daycareId, "ab-kh2t");
  assert.equal(canOfferApprove("live"), false);
  assert.equal(canOfferApprove("waiting"), true);

  const card = src("src/components/admin-review-card.tsx");
  assert.match(card, /canOfferApprove\(status\)/);
  assert.match(card, /data-ke="approve-closed"/);
  assert.match(card, /data-ke="approval-health"/);
});

test("public approval strip is statuses only and stays off until trust really holds", () => {
  assert.equal(publicApprovalEligible(kidsWorld), false);
  assert.equal(hasLicenceEvidence(kidsWorld), false);
  assert.equal(
    isPlatformLive("ab-kh2t", true, { claimStatus: "waiting", claimedAt: "2026-09-01" }),
    false,
    "Waiting stays off public Live even when claimed_at is set",
  );
  assert.equal(
    publicApprovalEligible({
      ...kidsWorld,
      claimStatus: "approved",
      claimedAt: "2026-09-01",
      live: true,
    }),
    false,
    "an unverified licence does not earn the trust strip",
  );
  assert.equal(
    publicApprovalEligible({
      ...kidsWorld,
      claimStatus: "approved",
      claimedAt: "2026-09-01",
      live: true,
      licenseStatus: "matched",
      licenseVerificationSource: "admin",
    }),
    true,
  );
  assert.equal(
    publicApprovalEligible({
      ...kidsWorld,
      id: "bc-1",
      daycareId: "bc-1",
      claimStatus: "approved",
      claimedAt: "2026-09-01",
      live: true,
      licenseNumber: "1",
    }),
    false,
  );

  const strip = src("src/components/kidease-approval.tsx");
  const page = src("src/routes/daycare.$slug.tsx");
  const searchCard = src("src/components/daycare-card.tsx");
  assert.match(strip, /data-ke="kidease-approval"/);
  assert.match(strip, /kideaseApprovedBody/);
  assert.doesNotMatch(strip, /licensePhoto|storage_ref|license_photo|application\/pdf|data:application/);
  assert.match(page, /KidEaseApprovalStrip/);
  assert.match(page, /publicApprovalEligible\(d\)/);
  assert.doesNotMatch(page.slice(page.indexOf("KidEaseApprovalStrip"), page.indexOf("KidEaseApprovalStrip") + 180), /licensePhoto/);
  assert.match(searchCard, /data-ke="kidease-approved-marker"/);
  assert.match(searchCard, /publicApprovalEligible\(item\)/);
  assert.match(src("src/lib/copy.ts"), /met KidEase licence and screening requirements/);
  assert.doesNotMatch(src("src/lib/copy.ts"), /Background checked by KidEase/);
});

test("approval clears the search memo and does not cache an empty Live result", async () => {
  flushSearchMemo();
  let builds = 0;
  await rememberSearch("edmonton-live", async () => {
    builds += 1;
    return [];
  });
  await rememberSearch("edmonton-live", async () => {
    builds += 1;
    return [{ id: "ab-kh2t" }];
  });
  assert.equal(builds, 2);

  flushSearchMemo();
  let after = 0;
  const rows = await rememberSearch("edmonton-live", async () => {
    after += 1;
    return [{ id: "ab-kh2t" }];
  });
  const cached = await rememberSearch("edmonton-live", async () => {
    after += 1;
    return [];
  });
  assert.equal(after, 1);
  assert.equal(cached[0].id, "ab-kh2t");
  assert.equal(rows[0].id, "ab-kh2t");

  const server = src("src/lib/server/approve-centre.ts");
  const search = src("src/lib/server/daycares.ts");
  const migration = src("migrations/0053_approve_live_trust.sql");
  assert.match(server, /flushSearchMemo\(\)/);
  assert.match(server, /syncVerifiedLocation/);
  assert.match(server, /claim_status = 'approved'/);
  assert.match(server, /listing_active = 1/);
  assert.match(server, /status = 'superseded'/);
  assert.match(search, /mergeApprovedCityListings/);
  assert.match(migration, /kids-world-daycare-kh2t/);
  assert.match(migration, /70051797/);
  assert.match(migration, /53\.5461/);
  assert.match(migration, /city = 'Edmonton'/);
  assert.match(migration, /name ilike '%kids world%'/);
  assert.match(migration, /status = 'approved'/);
  assert.match(migration, /listing_active = 1/);
  assert.match(migration, /extname = 'postgis'/);
  assert.doesNotMatch(migration, /storage_ref|license_photo/);
});

test("guest, parent, and daycare stay in sync with the approval strip", () => {
  assert.equal(showPublicClaimPrompt({ live: true, claimed: false, claimStatus: "approved" }), false);
  assert.equal(showPublicClaimPrompt({ live: false, claimed: false, claimStatus: "approved", claimedAt: "2026-09-01" }), false);
  assert.equal(showPublicClaimPrompt({ live: false, claimed: false, claimStatus: "unclaimed" }), true);
  assert.equal(approvalScreeningFact({ screeningOnFile: false, staffScreeningAttested: true }).status, "Attested");
  assert.equal(
    reviewDecisionFacts({ licenseNumber: "70051797", id: "ab-kh2t", staffScreeningAttested: true }).find((fact) => fact.id === "screening")?.status,
    "Attested",
  );

  const page = src("src/routes/daycare.$slug.tsx");
  assert.match(page, /showPublicClaimPrompt\(d\)/);
  assert.match(page, /data-ke="listing-claim-prompt"/);
  assert.match(page, /data-ke="listing-sticky-tour"/);
  assert.match(page, /data-ke="listing-sticky-cta"/);
  assert.doesNotMatch(page, /license_photo|storage_ref/);

  const provider = src("src/routes/provider.tsx");
  const trust = src("src/components/provider-trust.tsx");
  const today = src("src/components/today-urgency-home.tsx");
  assert.match(provider, /KidEaseApprovalStrip/);
  assert.match(provider, /audience="daycare"/);
  assert.match(provider, /officialLicenceNumber/);
  assert.match(trust, /data-ke="provider-licence-status"/);
  assert.match(trust, /data-ke="provider-screening-status"/);
  assert.match(trust, /audience="daycare"/);
  assert.doesNotMatch(trust, /trustClaimReviewTip"\)\}/);
  assert.match(today, /KidEaseApprovalStrip/);
  assert.match(src("src/lib/server/daycares.ts"), /screeningOnFile: Boolean\(d\.screeningOnFile\)/);
  assert.match(src("src/lib/server/catalog-neon.ts"), /screening_on_file/);
  assert.match(src("src/lib/copy.ts"), /Parents can find it in Live search/);
});

test("kh2t approval, licence, Live, and Edmonton search move together", () => {
  const waitingClaimed = {
    ...kidsWorld,
    claimStatus: "waiting",
    claimedAt: "2026-09-01",
    licenseStatus: "unverified",
    licenseVerificationSource: null,
  };
  assert.equal(
    isPlatformLive("ab-kh2t", true, { claimStatus: "waiting", claimedAt: waitingClaimed.claimedAt }),
    false,
  );
  assert.equal(
    normalizeAdminClaimStatus({
      claimStatus: "waiting",
      claimedAt: waitingClaimed.claimedAt,
      claimRowStatus: "waiting",
    }),
    "waiting",
  );
  assert.equal(
    listingStatusFromClaim("waiting", { live: false, claimedAt: waitingClaimed.claimedAt }),
    "waiting",
  );
  assert.equal(publicApprovalEligible(waitingClaimed), false);
  assert.equal(
    liveSearchHit({ origin: edmonton, radiusKm: 25, label: "Edmonton, AB", centre: waitingClaimed }),
    false,
  );

  const licence = adminLicenceFact({
    licenseNumber: "70051797",
    licensePhoto: null,
    licenseStatus: "unverified",
    daycareId: "ab-kh2t",
  });
  assert.equal(licence.status, "On file · 70051797");
  assert.notEqual(licence.status, "Missing");

  const unverifiedApproved = {
    ...kidsWorld,
    claimStatus: "approved",
    claimedAt: "2026-09-01",
    live: false,
    licenseStatus: "unverified",
  };
  assert.equal(hasLicenceEvidence(unverifiedApproved), false);
  assert.equal(publicApprovalEligible({ ...unverifiedApproved, live: true }), false);
  assert.equal(listingStatusFromClaim("approved", { live: false, claimedAt: "2026-09-01" }), "waiting");
  assert.equal(canOfferApprove(listingStatusFromClaim("approved", { live: false })), true);
  assert.equal(
    liveSearchHit({ origin: edmonton, radiusKm: 25, label: "Edmonton, AB", centre: unverifiedApproved }),
    false,
  );

  const plan = planApproval(kidsWorld, [{ id: "cl-joan", status: "waiting", createdAt: "2026-09-01T00:00:00.000Z" }], [
    { id: "ab-dup-1", name: "Kids World daycare", city: "Edmonton", province: "AB", claimStatus: "waiting" },
    { id: "ab-dup-2", name: "Kids World", city: "Edmonton", province: "AB", licenseNumber: null, claimStatus: "pending" },
    { id: "ab-dup-3", name: "Kids World Daycare", city: "Edmonton", province: "AB", claimStatus: "verified" },
  ]);
  assert.equal(plan.ok, true);
  assert.equal(plan.next.claimStatus, "approved");
  assert.equal(plan.next.licenseStatus, "matched");
  assert.equal(plan.next.licenseVerificationSource, "admin");
  assert.equal(plan.next.licenseNumber, "70051797");
  assert.equal(plan.next.listingActive, true);
  assert.equal(hasLicenceEvidence(plan.next), true);
  assert.equal(publicApprovalEligible(plan.next), true);
  assert.equal(listingStatusFromClaim(plan.next.claimStatus, { live: true, claimedAt: plan.next.claimedAt }), "live");
  assert.equal(canOfferApprove("live"), false);
  assert.equal(
    liveSearchHit({ origin: edmonton, radiusKm: 25, label: "Edmonton, AB", centre: plan.next }),
    true,
  );
  assert.deepEqual(plan.suppressDaycareIds.sort(), ["ab-dup-1", "ab-dup-2", "ab-dup-3"]);

  const admin = src("src/lib/server/admin-centres.ts");
  assert.match(admin, /hasLicenceEvidence\(/);
  assert.doesNotMatch(admin, /live: status === "approved"/);
  assert.doesNotMatch(admin, /'unverified'::text as license_status/);
  assert.doesNotMatch(admin, /0 as screening_on_file/);
  assert.match(admin, /d\.license_status/);
  assert.match(admin, /d\.license_verification_source/);
  assert.match(admin, /d\.screening_on_file/);
  const searchMerge = src("src/lib/server/approved-search.ts");
  assert.match(searchMerge, /ALBERTA/);
  assert.match(searchMerge, /placeApprovedCentre/);
  const trust = src("src/lib/trust.ts");
  assert.match(trust, /if \(!evidence\) return \[]/);
  const migration = src("migrations/0053_approve_live_trust.sql");
  assert.match(migration, /listing_active = 1/);
  assert.match(migration, /license_status = 'matched'/);
  assert.match(migration, /claim_status = 'approved'/);
  assert.match(migration, /city = 'Edmonton'/);
});
