import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { shapeProfileListing, uniqueLanguages, type ProfileListingCard } from "@/lib/profile-desk";
import type { WrittenReview } from "@/lib/host-desk";

export type ProfileDesk = {
  ok: boolean;
  childCount: number | null;
  languages: string[];
  listings: ProfileListingCard[];
  reviews: WrittenReview[];
};

const EMPTY: ProfileDesk = { ok: false, childCount: null, languages: [], listings: [], reviews: [] };

export const loadProfileDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ProfileDesk> => {
    try {
      const sql = await getSql();
      const [childRows, languageRows, listingRows, reviewRows] = await Promise.all([
        sql<{ n: number }>`select count(*)::int as n from children where user_id = ${context.userId}`.catch(() => []),
        sql<{ home_language: string | null }>`
          select home_language from children
          where user_id = ${context.userId} and coalesce(home_language, '') <> ''
        `.catch(() => []),
        sql<{
          id: string;
          slug: string;
          name: string;
          city: string | null;
          hours: string | null;
          hours_fr: string | null;
          age_min_months: number | null;
          age_max_months: number | null;
          ages_confirmed: number | boolean | null;
          languages: string | null;
          amenities: string | null;
          photos: string | null;
          license_number: string | null;
          license_status: string | null;
          spots_infant: number | null;
          spots_toddler: number | null;
          spots_preschool: number | null;
          last_vacancy_updated_at: string | null;
        }>`
          select d.id, d.slug, d.name, d.city, d.hours, d.hours_fr, d.age_min_months, d.age_max_months,
            d.ages_confirmed, d.languages, d.amenities, d.photos, d.license_number, d.license_status,
            d.spots_infant, d.spots_toddler, d.spots_preschool, d.last_vacancy_updated_at
          from daycares d
          join provider_daycares p on p.daycare_id = d.id
          where p.user_id = ${context.userId}
          order by d.name
          limit 6
        `.catch(() => []),
        sql<{
          id: string;
          author: string;
          rating: number;
          body: string;
          body_fr: string;
          created_at: string;
          centre_name: string | null;
        }>`
          select r.id, r.author, r.rating, r.body, r.body_fr, r.created_at, d.name as centre_name
          from reviews r
          join provider_daycares p on p.daycare_id = r.daycare_id
          join daycares d on d.id = r.daycare_id
          where p.user_id = ${context.userId}
            and r.status in ('published', 'approved')
            and r.rating between 1 and 5
          order by r.created_at desc
          limit 8
        `.catch(() => []),
      ]);
      const childCount = childRows[0] && Number.isFinite(Number(childRows[0].n)) ? Number(childRows[0].n) : null;
      const listings = listingRows.map((row) =>
        shapeProfileListing(
          {
            id: row.id,
            slug: row.slug,
            name: row.name,
            city: row.city,
            hours: row.hours,
            hoursFr: row.hours_fr,
            ageMinMonths: row.age_min_months,
            ageMaxMonths: row.age_max_months,
            agesConfirmed: row.ages_confirmed === true || row.ages_confirmed === 1,
            languages: row.languages,
            amenities: row.amenities,
            photos: row.photos,
            licenseNumber: row.license_number,
            licenseStatus: row.license_status,
            spotsInfant: row.spots_infant,
            spotsToddler: row.spots_toddler,
            spotsPreschool: row.spots_preschool,
            vacancyUpdatedAt: row.last_vacancy_updated_at,
          },
        ),
      );
      const reviews: WrittenReview[] = reviewRows.map((row) => ({
        id: row.id,
        author: row.author || "",
        rating: Number(row.rating) || 0,
        body: row.body || "",
        bodyFr: row.body_fr || "",
        createdAt: String(row.created_at || ""),
        centreName: row.centre_name,
      }));
      return {
        ok: true,
        childCount,
        languages: uniqueLanguages(languageRows.map((row) => row.home_language)),
        listings,
        reviews,
      };
    } catch {
      return EMPTY;
    }
  });
