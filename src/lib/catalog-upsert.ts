/**
 * Shared INSERT … ON CONFLICT for licensed listings.
 * Fresh catalogue rows get full catalogue fields.
 * Claimed rows, and any row a provider owns, has a claim on, or staffs,
 * are left alone so open spots and profile edits survive later imports.
 * Filled phone / email / website are never replaced with blank.
 * Sourced ages (data/ops/ages-sourced-20261002.csv) are matched by listing id
 * before this upsert. ages_confirmed = 1, claimed rows, and owner-edited ages
 * are never replaced with 0 or catalogue defaults. A filled age range, source,
 * or source URL is never blanked. Listing d_d85jtifbkh2t is never age-written.
 */

import { correctCentreNameTypos, normalizeListingSlug } from "./listing-slug.ts";
import { listingVisibilityWrite } from "./listing-visibility.ts";

export type CatalogUpsertInput = {
  id: string;
  slug: string;
  name: string;
  nameFr: string;
  tagline: string;
  taglineFr: string;
  description: string;
  descriptionFr: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  lat: number;
  lng: number;
  phone?: string | null;
  hours: string;
  hoursFr: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  infantMonthly: number | null;
  toddlerMonthly: number | null;
  preschoolMonthly: number | null;
  partTimeMonthly: number | null;
  spotsInfant: number;
  spotsToddler: number;
  spotsPreschool: number;
  waitlist: number;
  ratingX10: number;
  reviewCount?: number;
  reviews?: Array<unknown>;
  licenseNumber: string;
  languages: string;
  amenities: string;
  photos: string[];
  googlePlaceId?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  visibility?: string | null;
  isTest?: boolean;
  /** 1 when the approved sourced-ages file matched this listing id. */
  agesConfirmed?: number | null;
  agesSource?: string | null;
  agesSourceUrl?: string | null;
};

export const CONTACT_BLANK_SAFE_SQL = `case
        when excluded.phone is null or btrim(excluded.phone) = '' then daycares.phone
        else excluded.phone
      end`;

export const EMAIL_BLANK_SAFE_SQL = `case
        when excluded.contact_email is null or btrim(excluded.contact_email) = '' then daycares.contact_email
        else excluded.contact_email
      end`;

export const WEBSITE_BLANK_SAFE_SQL = `case
        when excluded.website is null or btrim(excluded.website) = '' then daycares.website
        else excluded.website
      end`;

/**
 * Keep a real confirmed range and the protected listing. A confirmed flag
 * with no months is not an age yet, so a sourced range can fill it.
 * Never replace a real range with 0.
 */
export const AGE_MIN_PRESERVE_SQL = `case
        when daycares.id = 'd_d85jtifbkh2t' then daycares.age_min_months
        when coalesce(daycares.ages_confirmed, 0) = 1
          and daycares.age_max_months > daycares.age_min_months
          and daycares.age_max_months > 0
          then daycares.age_min_months
        when excluded.ages_confirmed = 1 then excluded.age_min_months
        when excluded.age_max_months > excluded.age_min_months and excluded.age_max_months > 0
          then excluded.age_min_months
        when daycares.age_max_months > daycares.age_min_months and daycares.age_max_months > 0
          then daycares.age_min_months
        else excluded.age_min_months
      end`;

export const AGE_MAX_PRESERVE_SQL = `case
        when daycares.id = 'd_d85jtifbkh2t' then daycares.age_max_months
        when coalesce(daycares.ages_confirmed, 0) = 1
          and daycares.age_max_months > daycares.age_min_months
          and daycares.age_max_months > 0
          then daycares.age_max_months
        when excluded.ages_confirmed = 1 then excluded.age_max_months
        when excluded.age_max_months > excluded.age_min_months and excluded.age_max_months > 0
          then excluded.age_max_months
        when daycares.age_max_months > daycares.age_min_months and daycares.age_max_months > 0
          then daycares.age_max_months
        else excluded.age_max_months
      end`;

export const AGES_CONFIRMED_PRESERVE_SQL = `case
        when daycares.id = 'd_d85jtifbkh2t' then daycares.ages_confirmed
        when coalesce(daycares.ages_confirmed, 0) = 1 then daycares.ages_confirmed
        when excluded.ages_confirmed = 1 then 1
        else coalesce(daycares.ages_confirmed, 0)
      end`;

export const AGES_SOURCE_PRESERVE_SQL = `case
        when daycares.id = 'd_d85jtifbkh2t' then daycares.ages_source
        when coalesce(daycares.ages_confirmed, 0) = 1
          and daycares.age_max_months > daycares.age_min_months
          and daycares.age_max_months > 0
          then daycares.ages_source
        when excluded.ages_confirmed = 1 and nullif(btrim(coalesce(excluded.ages_source, '')), '') is not null
          then excluded.ages_source
        else daycares.ages_source
      end`;

export const AGES_SOURCE_URL_PRESERVE_SQL = `case
        when daycares.id = 'd_d85jtifbkh2t' then daycares.ages_source_url
        when coalesce(daycares.ages_confirmed, 0) = 1
          and daycares.age_max_months > daycares.age_min_months
          and daycares.age_max_months > 0
          then daycares.ages_source_url
        when excluded.ages_confirmed = 1 and nullif(btrim(coalesce(excluded.ages_source_url, '')), '') is not null
          then excluded.ages_source_url
        else daycares.ages_source_url
      end`;

/** Keep a filled contact when the incoming catalogue/master value is blank. */
export function preserveFilledContact(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string {
  const next = String(incoming ?? "").trim();
  if (next) return next;
  return String(existing ?? "").trim();
}

export const DAYCARE_UPSERT_SQL = `
insert into daycares (
  id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
  address, city, province, postal_code, lat, lng, phone, hours, hours_fr,
  age_min_months, age_max_months, infant_monthly, toddler_monthly,
  preschool_monthly, part_time_monthly, spots_infant, spots_toddler,
  spots_preschool, waitlist, rating_x10, review_count, license_number,
  languages, amenities, photos, verified, google_place_id, contact_email,
  website, visibility, is_test, ages_confirmed, ages_source, ages_source_url
) values (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
  $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,
  $40,$41,$42
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  name_fr = excluded.name_fr,
  tagline = excluded.tagline,
  tagline_fr = excluded.tagline_fr,
  description = excluded.description,
  description_fr = excluded.description_fr,
  address = excluded.address,
  city = excluded.city,
  province = excluded.province,
  postal_code = excluded.postal_code,
  lat = excluded.lat,
  lng = excluded.lng,
  phone = ${CONTACT_BLANK_SAFE_SQL},
  hours = excluded.hours,
  hours_fr = excluded.hours_fr,
  age_min_months = ${AGE_MIN_PRESERVE_SQL},
  age_max_months = ${AGE_MAX_PRESERVE_SQL},
  ages_confirmed = ${AGES_CONFIRMED_PRESERVE_SQL},
  ages_source = ${AGES_SOURCE_PRESERVE_SQL},
  ages_source_url = ${AGES_SOURCE_URL_PRESERVE_SQL},
  infant_monthly = excluded.infant_monthly,
  toddler_monthly = excluded.toddler_monthly,
  preschool_monthly = excluded.preschool_monthly,
  part_time_monthly = excluded.part_time_monthly,
  spots_infant = excluded.spots_infant,
  spots_toddler = excluded.spots_toddler,
  spots_preschool = excluded.spots_preschool,
  waitlist = excluded.waitlist,
  rating_x10 = excluded.rating_x10,
  review_count = excluded.review_count,
  license_number = excluded.license_number,
  languages = excluded.languages,
  amenities = excluded.amenities,
  photos = excluded.photos,
  google_place_id = coalesce(nullif(btrim(excluded.google_place_id), ''), daycares.google_place_id),
  contact_email = ${EMAIL_BLANK_SAFE_SQL},
  website = ${WEBSITE_BLANK_SAFE_SQL},
  visibility = excluded.visibility,
  is_test = excluded.is_test
where daycares.claimed_at is null
  and not exists (
    select 1 from provider_daycares pd where pd.daycare_id = daycares.id
  )
  and not exists (
    select 1 from listing_claims lc where lc.daycare_id = daycares.id
  )
  and not exists (
    select 1 from centre_members cm where cm.daycare_id = daycares.id
  )
`;

export function daycareUpsertParams(d: CatalogUpsertInput): unknown[] {
  const reviewCount =
    typeof d.reviewCount === "number" ? d.reviewCount : (d.reviews?.length ?? 0);
  const flags = listingVisibilityWrite({
    id: d.id,
    slug: d.slug,
    name: d.name,
    licenseNumber: d.licenseNumber,
    address: d.address,
    visibility: d.visibility,
    isTest: d.isTest,
  });
  return [
    d.id,
    normalizeListingSlug(d.slug) || d.slug,
    correctCentreNameTypos(d.name) || d.name,
    correctCentreNameTypos(d.nameFr) || d.nameFr,
    d.tagline,
    d.taglineFr,
    d.description,
    d.descriptionFr,
    d.address,
    d.city,
    d.province,
    d.postalCode,
    d.lat,
    d.lng,
    d.phone?.trim() || null,
    d.hours,
    d.hoursFr,
    d.ageMinMonths,
    d.ageMaxMonths,
    d.infantMonthly,
    d.toddlerMonthly,
    d.preschoolMonthly,
    d.partTimeMonthly,
    d.spotsInfant,
    d.spotsToddler,
    d.spotsPreschool,
    d.waitlist,
    d.ratingX10,
    reviewCount,
    d.licenseNumber,
    d.languages,
    d.amenities,
    d.photos.join(","),
    0,
    d.googlePlaceId?.trim() || null,
    d.contactEmail?.trim() || null,
    d.website?.trim() || null,
    flags.visibility,
    flags.isTest,
    d.agesConfirmed === 1 ? 1 : 0,
    d.agesConfirmed === 1 ? d.agesSource?.trim() || null : null,
    d.agesConfirmed === 1 ? d.agesSourceUrl?.trim() || null : null,
  ];
}
