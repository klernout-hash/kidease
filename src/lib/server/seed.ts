import type { Sql } from "@/lib/db";
import { catalogMonths, type CatalogDaycare } from "@/lib/catalog";

/** Nationwide catalogue is searched in memory. SQL only stores viewed/booked rows. */
export async function ensureSeed(_sql: Sql) {
  return;
}

export async function upsertDaycare(sql: Sql, d: CatalogDaycare) {
  const months = catalogMonths();
  await sql.query(
    `insert into daycares (
      id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
      address, city, province, postal_code, lat, lng, phone, hours, hours_fr,
      age_min_months, age_max_months, infant_monthly, toddler_monthly,
      preschool_monthly, part_time_monthly, spots_infant, spots_toddler,
      spots_preschool, waitlist, rating_x10, review_count, license_number,
      languages, amenities, photos, verified
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
    )
    on conflict (id) do update set
      slug = excluded.slug,
      name = excluded.name,
      lat = excluded.lat,
      lng = excluded.lng,
      spots_infant = excluded.spots_infant,
      spots_toddler = excluded.spots_toddler,
      spots_preschool = excluded.spots_preschool
    where daycares.claimed_at is null`,
    [
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
      d.phone || null,
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
      d.reviews.length,
      d.licenseNumber,
      d.languages,
      d.amenities,
      d.photos.join(","),
      1,
    ],
  );
  for (const month of months) {
    await sql.query(
      `insert into availability (daycare_id, month, infant, toddler, preschool)
       values ($1, $2, $3, $4, $5)
       on conflict (daycare_id, month) do nothing`,
      [d.id, month, d.spotsInfant, d.spotsToddler, d.spotsPreschool],
    );
  }
}

