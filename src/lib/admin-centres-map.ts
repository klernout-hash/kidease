/**
 * Admin centre list mapping — no Start/DB so tests can lock Joan onto Waiting.
 */
import { incompleteMissing, type IncompleteMissingField } from "./listing-incomplete.ts";
import { isQueueableClaimStatus } from "./listing-status.ts";
import { splitPhotoList } from "./listing-photo.ts";
import { normalizeAdminClaimStatus } from "./listing-queue.ts";
import { licenseReviewMarker } from "./private-docs.ts";
import { asIsoString, compareTimeDesc } from "./sort-time.ts";
import { isAdminOnlyListing, staffQueueRows } from "./listing-visibility.ts";

export type AdminCentreSqlRow = {
  daycare_id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  province: string;
  phone: string | null;
  contact_email: string | null;
  claim_status: string | null;
  claimed_at: string | Date | null;
  claim_id: string | null;
  claim_row_status: string | null;
  provider_user_id: string | null;
  provider_name: string | null;
  provider_email: string | null;
  submitted_at: string | Date | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  license_number: string | null;
  license_status: string | null;
  license_expiry: string | null;
  licensed_capacity: number | null;
  registry_match_state: string | null;
  license_verified_at: string | Date | null;
  license_verification_source: string | null;
  staff_screening_attested: number | boolean | null;
  staff_screening_attested_at: string | Date | null;
  screening_on_file: number | boolean | null;
  screening_on_file_at: string | Date | null;
  license_photo: string | null;
  photos: string | null;
  hours?: string | null;
  infant_monthly?: number | null;
  toddler_monthly?: number | null;
  preschool_monthly?: number | null;
  part_time_monthly?: number | null;
  ages_confirmed?: number | boolean | null;
  age_min_months?: number | null;
  age_max_months?: number | null;
  provider_link_user_id?: string | null;
  last_photo_updated_at?: string | Date | null;
  last_vacancy_updated_at?: string | Date | null;
  created_at?: string | Date | null;
  visibility?: string | null;
  is_test?: number | boolean | null;
  merged_into?: string | null;
  merged_into_name?: string | null;
  import_fault?: string | null;
};

export type AdminCentreRow = {
  daycareId: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  province: string;
  phone: string | null;
  contactEmail: string | null;
  claimStatus: string;
  claimedAt: string | null;
  live: boolean;
  claimId: string | null;
  claimRowStatus: string | null;
  providerUserId: string | null;
  providerName: string | null;
  providerEmail: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  licenseNumber: string | null;
  licenseStatus: string;
  licenseExpiry: string | null;
  licensedCapacity: number | null;
  registryMatchState: string;
  licenseVerifiedAt: string | null;
  licenseVerificationSource: string | null;
  staffScreeningAttested: boolean;
  staffScreeningAttestedAt: string | null;
  screeningOnFile: boolean;
  screeningOnFileAt: string | null;
  licensePhoto: string | null;
  storefrontPhoto: string | null;
  isTest: boolean;
  hasProviderLink: boolean;
  hasListingClaim: boolean;
  missing: IncompleteMissingField[];
  updatedAt: string | null;
  mergedInto: string | null;
  mergedIntoName: string | null;
  importFault: string | null;
};

function firstReviewPhoto(photos?: string | null, licensePhoto?: string | null) {
  const storefront = splitPhotoList(photos).find(
    (p) =>
      p.startsWith("data:image") ||
      p.startsWith("/photos/buildings/") ||
      p.startsWith("/img/") ||
      /^https?:\/\//i.test(p) ||
      (p.startsWith("/") && !p.startsWith("/photos/") && !p.includes("placeholder") && !p.includes("-logo")),
  );
  return {
    licensePhoto: licenseReviewMarker(licensePhoto),
    storefrontPhoto: storefront || null,
  };
}

export function mapAdminCentreSqlRow(r: AdminCentreSqlRow): AdminCentreRow {
  const hasProviderLink = Boolean(r.provider_link_user_id);
  const status = normalizeAdminClaimStatus({
    claimStatus: r.claim_status,
    claimedAt: r.claimed_at,
    claimRowStatus: r.claim_row_status,
    hasProviderLink,
  });
  const photos = firstReviewPhoto(r.photos, r.license_photo);
  const screeningOnFile = r.screening_on_file === 1 || r.screening_on_file === true;
  const submittedAt = asIsoString(r.submitted_at);
  const updatedAt =
    [r.last_photo_updated_at, r.last_vacancy_updated_at, r.reviewed_at, submittedAt, r.created_at]
      .map((value) => asIsoString(value))
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => compareTimeDesc(a, b))[0] || submittedAt;
  return {
    daycareId: r.daycare_id,
    slug: r.slug,
    name: r.name,
    address: r.address,
    city: r.city,
    province: r.province,
    phone: r.phone,
    contactEmail: r.contact_email,
    claimStatus: status,
    claimedAt: r.claimed_at ? asIsoString(r.claimed_at) : null,
    live: status === "approved",
    claimId: r.claim_id,
    claimRowStatus: r.claim_row_status,
    providerUserId: r.provider_user_id,
    providerName: r.provider_name,
    providerEmail: r.provider_email,
    submittedAt,
    reviewedAt: r.reviewed_at ? asIsoString(r.reviewed_at) : null,
    reviewNote: r.review_note,
    licenseNumber: r.license_number,
    licenseStatus: r.license_status || "unverified",
    licenseExpiry: r.license_expiry,
    licensedCapacity: r.licensed_capacity,
    registryMatchState: r.registry_match_state || "unmatched",
    licenseVerifiedAt: r.license_verified_at ? asIsoString(r.license_verified_at) : null,
    licenseVerificationSource: r.license_verification_source,
    staffScreeningAttested: r.staff_screening_attested === 1 || r.staff_screening_attested === true,
    staffScreeningAttestedAt: r.staff_screening_attested_at ? asIsoString(r.staff_screening_attested_at) : null,
    screeningOnFile,
    screeningOnFileAt: r.screening_on_file_at ? asIsoString(r.screening_on_file_at) : null,
    isTest: isAdminOnlyListing({
      id: r.daycare_id,
      slug: r.slug,
      name: r.name,
      licenseNumber: r.license_number,
      address: r.address,
      visibility: r.visibility,
      isTest: r.is_test,
    }),
    ...photos,
    hasProviderLink,
    hasListingClaim: Boolean(r.claim_id),
    mergedInto: (r.merged_into || "").trim() || null,
    mergedIntoName: (r.merged_into_name || "").trim() || null,
    importFault: (r.import_fault || "").trim() || null,
    missing: incompleteMissing({
      claimStatus: status,
      claimedAt: r.claimed_at,
      claimRowStatus: r.claim_row_status,
      hasProviderLink,
      hasListingClaim: Boolean(r.claim_id),
      live: status === "approved",
      licensePhoto: photos.licensePhoto,
      screeningOnFile,
      photos: r.photos,
      storefrontPhoto: photos.storefrontPhoto,
      province: r.province,
      infantMonthly: r.infant_monthly ?? null,
      toddlerMonthly: r.toddler_monthly ?? null,
      preschoolMonthly: r.preschool_monthly ?? null,
      partTimeMonthly: r.part_time_monthly ?? null,
      agesKnown: r.ages_confirmed === 1 || r.ages_confirmed === true,
      ageMinMonths: r.age_min_months ?? 0,
      ageMaxMonths: r.age_max_months ?? 0,
      hours: r.hours,
    }),
    updatedAt,
  };
}

export function sortAdminCentreRows(rows: AdminCentreRow[]): AdminCentreRow[] {
  const rank = (s: string) => (s === "waiting" || s === "pending" ? 0 : s === "approved" ? 1 : 2);
  return [...rows].sort(
    (a, b) => rank(a.claimStatus) - rank(b.claimStatus) || compareTimeDesc(a.submittedAt, b.submittedAt) || a.name.localeCompare(b.name),
  );
}

/** Waiting-on-you slice: production claims only when Show QA is off. */
export function adminQueueWaitingRows<T extends { claimStatus: string; isTest?: boolean | number | null; daycareId?: string }>(
  rows: T[],
  includeQa: boolean,
): T[] {
  return staffQueueRows(rows, includeQa).filter((row) => isQueueableClaimStatus(row.claimStatus));
}
