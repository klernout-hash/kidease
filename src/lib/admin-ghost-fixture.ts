import { GHOST_LISTING } from "./ghost-listing.ts";
import type { IncompleteMissingField } from "./listing-incomplete.ts";
import { looksLikeTestFixture } from "./listing-visibility.ts";
import type { AdminCentreRow } from "./server/admin-centres.ts";

const QA_FIXTURE_KEY = "kidease-admin-show-qa";

export function readQaFixtureToggle(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(QA_FIXTURE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeQaFixtureToggle(on: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(QA_FIXTURE_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked */
  }
}

export function isGhostClaimLabRow(row: {
  daycareId?: string | null;
  slug?: string | null;
  name?: string | null;
  licenseNumber?: string | null;
}): boolean {
  const id = row.daycareId || "";
  if (!looksLikeTestFixture({ id, daycareId: id, slug: row.slug, name: row.name, licenseNumber: row.licenseNumber })) {
    return false;
  }
  const slug = (row.slug || "").toLowerCase();
  const name = (row.name || "").toLowerCase();
  return id === GHOST_LISTING.id || slug.includes("ghost") || name.includes("ghost claim");
}

/** Unpublished admin-only row. Shown only when Show QA fixtures is on. */
export function ghostClaimLabCentre(): AdminCentreRow {
  const missing: IncompleteMissingField[] = ["license_photo", "screening", "photo", "hours", "ages"];
  return {
    daycareId: GHOST_LISTING.id,
    slug: GHOST_LISTING.slug,
    name: GHOST_LISTING.name,
    address: GHOST_LISTING.address,
    city: GHOST_LISTING.city,
    province: GHOST_LISTING.province,
    phone: GHOST_LISTING.phone,
    contactEmail: null,
    claimStatus: "waiting",
    claimedAt: "2026-01-01T00:00:00.000Z",
    live: false,
    claimId: null,
    claimRowStatus: "waiting",
    providerUserId: null,
    providerName: null,
    providerEmail: null,
    submittedAt: "2026-01-01T00:00:00.000Z",
    reviewedAt: null,
    reviewNote: "Unpublished QA fixture. Not a real centre.",
    licenseNumber: GHOST_LISTING.licenseNumber,
    licenseStatus: "unverified",
    licenseExpiry: null,
    licensedCapacity: null,
    registryMatchState: "unknown",
    licenseVerifiedAt: null,
    licenseVerificationSource: null,
    staffScreeningAttested: false,
    staffScreeningAttestedAt: null,
    screeningOnFile: false,
    screeningOnFileAt: null,
    licensePhoto: null,
    storefrontPhoto: null,
    isTest: true,
    hasProviderLink: false,
    hasListingClaim: true,
    missing,
    updatedAt: null,
    addonLine: null,
    mergedInto: null,
    mergedIntoName: null,
    importFault: null,
    reviewOf: null,
  };
}

export function withGhostClaimLab<T extends AdminCentreRow>(rows: readonly T[]): T[] {
  if (rows.some((row) => isGhostClaimLabRow(row))) return [...rows];
  return [...rows, ghostClaimLabCentre() as T];
}
