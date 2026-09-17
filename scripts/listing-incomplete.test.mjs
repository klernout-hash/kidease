import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  belongsOnIncompleteQueue,
  incompleteCrmPayload,
  incompleteMissing,
  isIncompleteQueueEligible,
  selectIncompleteRows,
} from "../src/lib/listing-incomplete.ts";
import { catalogImportWrite, normalizeAdminClaimStatus } from "../src/lib/listing-queue.ts";
import { STOCK_CREATE_PHOTOS } from "../src/lib/listing-photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

/** Joan-style partial submit: provider-linked, waiting, uploads still missing. */
function joanPartial(overrides = {}) {
  return {
    daycareId: "d-joan",
    name: "Joan's Home Daycare",
    slug: "joans-home-daycare",
    claimedAt: null,
    claimStatus: "waiting",
    claimRowStatus: "waiting",
    hasListingClaim: true,
    hasProviderLink: true,
    live: false,
    licensePhoto: null,
    screeningOnFile: false,
    photos: STOCK_CREATE_PHOTOS,
    storefrontPhoto: null,
    province: "MB",
    infantMonthly: 1200,
    toddlerMonthly: 1100,
    preschoolMonthly: 1000,
    partTimeMonthly: null,
    agesKnown: false,
    ageMinMonths: 6,
    ageMaxMonths: 72,
    hours: "7:30 a.m. – 5:30 p.m., Monday to Friday",
    providerName: "Joan",
    providerEmail: "joan@example.com",
    submittedAt: "2026-09-16T18:00:00.000Z",
    updatedAt: "2026-09-16T18:05:00.000Z",
    ...overrides,
  };
}

test("provider-linked unclaimed/waiting partials belong on Incomplete", () => {
  const joan = joanPartial();
  assert.equal(isIncompleteQueueEligible(joan), true);
  assert.equal(belongsOnIncompleteQueue(joan), true);
  assert.deepEqual(incompleteMissing(joan), ["license_photo", "screening", "photo", "ages"]);

  const orphan = joanPartial({
    claimStatus: "unclaimed",
    claimRowStatus: null,
    hasListingClaim: false,
    hasProviderLink: true,
  });
  assert.equal(normalizeAdminClaimStatus(orphan), "waiting");
  assert.equal(isIncompleteQueueEligible(orphan), true);
  assert.equal(belongsOnIncompleteQueue(orphan), true);

  const claimStarted = joanPartial({
    claimStatus: "pending",
    hasProviderLink: false,
    hasListingClaim: true,
  });
  assert.equal(isIncompleteQueueEligible(claimStarted), true);
  assert.equal(belongsOnIncompleteQueue(claimStarted), true);
});

test("catalogue master-data unclaimed centres stay off Incomplete", () => {
  const imported = catalogImportWrite();
  const catalogue = {
    ...joanPartial({
      name: "Bonnie Bairns Childcare",
      slug: "bonnie-bairns-childcare-services-1",
      claimStatus: imported.claimStatus,
      claimedAt: imported.claimedAt,
      claimRowStatus: null,
      hasListingClaim: false,
      hasProviderLink: false,
      live: false,
    }),
  };
  assert.equal(isIncompleteQueueEligible(catalogue), false);
  assert.equal(belongsOnIncompleteQueue(catalogue), false);
  assert.deepEqual(
    selectIncompleteRows([catalogue, joanPartial()]).map((row) => row.slug),
    ["joans-home-daycare"],
  );
});

test("approved live centres are excluded even when uploads are missing", () => {
  const live = joanPartial({
    claimStatus: "approved",
    claimedAt: "2026-09-01T00:00:00.000Z",
    live: true,
    licensePhoto: null,
    screeningOnFile: false,
  });
  assert.equal(isIncompleteQueueEligible(live), false);
  assert.equal(belongsOnIncompleteQueue(live), false);

  const approvedToken = joanPartial({
    claimStatus: "approved",
    claimedAt: null,
    live: false,
  });
  assert.equal(isIncompleteQueueEligible(approvedToken), false);

  const declined = joanPartial({ claimStatus: "declined", live: false });
  assert.equal(isIncompleteQueueEligible(declined), false);
});

test("missing[] is structured for CRM and does not send a GHL webhook", () => {
  const joan = joanPartial();
  const payload = incompleteCrmPayload({
    ...joan,
    missing: incompleteMissing(joan),
  });
  assert.deepEqual(payload.missing, ["license_photo", "screening", "photo", "ages"]);
  assert.equal(payload.providerName, "Joan");
  assert.equal(payload.providerEmail, "joan@example.com");
  assert.equal(payload.listingStatus, "waiting");
  assert.equal(payload.live, false);
  assert.equal(payload.claimStatus, "waiting");

  const completeWaiting = joanPartial({
    licensePhoto: "on-file",
    screeningOnFile: true,
    photos: "/photos/buildings/joan.jpg",
    agesKnown: true,
  });
  assert.deepEqual(incompleteMissing(completeWaiting), []);
  assert.equal(belongsOnIncompleteQueue(completeWaiting), false);

  const incomplete = src("src/lib/listing-incomplete.ts");
  assert.doesNotMatch(incomplete, /postGhl|GHL_WEBHOOK|captureSignupIntake/);
  assert.doesNotMatch(src("src/components/admin-incomplete.tsx"), /postGhl|GHL_WEBHOOK/);
  assert.doesNotMatch(src("src/lib/server/admin-centres.ts"), /postGhlSignupIntake|GHL_WEBHOOK/);
});

test("admin list and desk expose Incomplete with missing chips and Waiting/Screening links", () => {
  const centres = src("src/lib/server/admin-centres.ts");
  assert.match(centres, /incompleteMissing/);
  assert.match(centres, /hasProviderLink/);
  assert.match(centres, /provider_link_user_id/);
  assert.match(centres, /listIncompleteAdminCentres/);
  assert.match(centres, /infant_monthly/);
  assert.match(centres, /ages_confirmed/);

  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /AdminIncompleteQueue/);
  assert.match(admin, /listIncompleteAdminCentres/);
  assert.match(admin, /tab === "incomplete"/);
  assert.match(admin, /Needs complete/);

  const nav = src("src/lib/desk-nav.ts");
  assert.match(nav, /id: "incomplete"/);
  assert.match(nav, /adminIncompleteNav/);

  const tabs = src("src/lib/account-notify.ts");
  assert.match(tabs, /"incomplete"/);

  const ui = src("src/components/admin-incomplete.tsx");
  assert.match(ui, /c\.missing/);
  assert.match(ui, /adminIncompleteOpenQueue/);
  assert.match(ui, /adminIncompleteOpenScreening/);
  assert.match(ui, /adminIncompleteOpenVerify/);
  assert.match(ui, /adminIncompleteNeedLicensePhoto/);
});
