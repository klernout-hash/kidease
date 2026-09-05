import type { Daycare } from "@/lib/types";
import { isPlatformLive } from "@/lib/live";
import { defaultTrustFields, normalizeLicenseStatus, normalizeMatchState } from "@/lib/trust";

export type DaycareRow = {
  id: string;
  slug: string;
  name: string;
  name_fr: string;
  tagline: string;
  tagline_fr: string;
  description: string;
  description_fr: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  lat: number;
  lng: number;
  phone: string | null;
  hours: string;
  hours_fr: string;
  age_min_months: number;
  age_max_months: number;
  infant_monthly: number | null;
  toddler_monthly: number | null;
  preschool_monthly: number | null;
  part_time_monthly: number | null;
  spots_infant: number;
  spots_toddler: number;
  spots_preschool: number;
  waitlist: number;
  rating_x10: number;
  review_count: number;
  license_number: string | null;
  languages: string;
  amenities: string;
  photos: string;
  verified: number;
  contact_email?: string | null;
  claimed_at?: string | null;
  claim_status?: string | null;
  priority_until?: string | null;
  ages_confirmed?: number | boolean | null;
  listing_active?: number | boolean | null;
  pause_code?: string | null;
  pause_reason?: string | null;
  visibility?: string | null;
  is_test?: number | boolean | null;
  license_status?: string | null;
  license_expiry?: string | Date | null;
  licensed_capacity?: number | null;
  registry_match_state?: string | null;
  license_verified_at?: string | null;
  license_verification_source?: string | null;
  staff_screening_attested?: number | boolean | null;
  staff_screening_attested_at?: string | null;
  staff_screening_attested_by?: string | null;
  stripe_identity_verified?: number | boolean | null;
};

export function mapDaycare(r: DaycareRow): Daycare {
  const listingActive = r.listing_active === 0 || r.listing_active === false ? false : true;
  const claimed = Boolean(r.claimed_at);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nameFr: r.name_fr,
    tagline: r.tagline,
    taglineFr: r.tagline_fr,
    description: r.description,
    descriptionFr: r.description_fr,
    address: r.address,
    city: r.city,
    province: r.province,
    postalCode: r.postal_code,
    lat: Number(r.lat),
    lng: Number(r.lng),
    phone: r.phone,
    hours: r.hours,
    hoursFr: r.hours_fr,
    ageMinMonths: r.age_min_months,
    ageMaxMonths: r.age_max_months,
    infantMonthly: r.infant_monthly,
    toddlerMonthly: r.toddler_monthly,
    preschoolMonthly: r.preschool_monthly,
    partTimeMonthly: r.part_time_monthly,
    spotsInfant: r.spots_infant,
    spotsToddler: r.spots_toddler,
    spotsPreschool: r.spots_preschool,
    waitlist: r.waitlist,
    ratingX10: r.rating_x10,
    reviewCount: r.review_count,
    googlePlaceId: null,
    licenseNumber: r.license_number,
    languages: r.languages,
    amenities: r.amenities,
    photos: r.photos ? r.photos.split(",").filter(Boolean) : [],
    verified: Boolean(r.verified),
    contactEmail: r.contact_email ?? null,
    claimed,
    claimStatus: r.claim_status ?? null,
    listingActive,
    pauseCode: r.pause_code ?? null,
    pauseReason: r.pause_reason ?? null,
    live: isPlatformLive(r.id, claimed, {
      listingActive,
      ratingX10: r.rating_x10,
      reviewCount: r.review_count,
    }),
    feeConfirmed: claimed,
    availabilityKnown: claimed,
    spotsUpdatedAt: r.claimed_at ?? null,
    ...defaultTrustFields(),
    licenseStatus: normalizeLicenseStatus(r.license_status),
    licenseExpiry: r.license_expiry ? String(r.license_expiry).slice(0, 10) : null,
    licensedCapacity: r.licensed_capacity ?? null,
    registryMatchState: normalizeMatchState(r.registry_match_state),
    licenseVerifiedAt: r.license_verified_at ?? null,
    licenseVerificationSource: r.license_verification_source ?? null,
    staffScreeningAttested: r.staff_screening_attested === 1 || r.staff_screening_attested === true,
    staffScreeningAttestedAt: r.staff_screening_attested_at ?? null,
    staffScreeningAttestedBy: r.staff_screening_attested_by ?? null,
    stripeIdentityVerified: r.stripe_identity_verified === 1 || r.stripe_identity_verified === true,
    priority: Boolean(r.priority_until && Date.parse(r.priority_until) > Date.now()),
    priorityUntil: r.priority_until ?? null,
    agesKnown: Boolean(r.ages_confirmed),
    visibility: r.visibility === "admin_only" ? "admin_only" : "public",
    isTest: r.is_test === 1 || r.is_test === true,
  };
}

export function fromPrice(d: Daycare) {
  const vals = [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly].filter(
    (n): n is number => n != null && n > 0,
  );
  return vals.length ? Math.min(...vals) : 0;
}

export function spotsTotal(d: Daycare) {
  return d.spotsInfant + d.spotsToddler + d.spotsPreschool;
}
