/**
 * Shared INSERT … ON CONFLICT for licensed listings.
 * Unclaimed rows get full catalogue fields. Claimed rows are never updated.
 * Filled phone / email / website are never replaced with blank.
 */

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
  website, visibility, is_test
) values (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
  $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39
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
  age_min_months = excluded.age_min_months,
  age_max_months = excluded.age_max_months,
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
`;

export function daycareUpsertParams(d: CatalogUpsertInput): unknown[] {
  const reviewCount =
    typeof d.reviewCount === "number" ? d.reviewCount : (d.reviews?.length ?? 0);
  return [
    d.id,
    d.slug,
    d.name,
    d.nameFr,
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
    d.visibility === "admin_only" ? "admin_only" : "public",
    d.isTest ? 1 : 0,
  ];
}
