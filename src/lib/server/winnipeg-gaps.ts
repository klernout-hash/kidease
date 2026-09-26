/**
 * Admin measurement + sourced fill for Winnipeg search-visible listings.
 * Does not invent ages, fees, or photos. Blank cells are not written.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, dbSource } from "@/lib/db";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { requireAdmin } from "@/lib/server/roles";
import {
  hasRealPhoto,
  isPlatformLiveListing,
  isSearchVisibleListing,
  isWinnipegOutreachCity,
  liveLookingGaps,
  mergePhotoList,
  planCompletenessFill,
  summarizeLiveLooking,
  winnipegGapsCsv,
  type CompletenessInput,
  type FillPatch,
} from "@/lib/winnipeg-completeness";

const MAX_APPLY = 100;

type GapDbRow = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  website: string | null;
  license_number: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  ages_confirmed: number | boolean | null;
  infant_monthly: number | null;
  toddler_monthly: number | null;
  preschool_monthly: number | null;
  part_time_monthly: number | null;
  amenities: string | null;
  photos: string | null;
  claimed_at: string | null;
  claim_status: string | null;
  listing_active: number | boolean | null;
  rating_x10: number | null;
  review_count: number | null;
  visibility: string | null;
  is_test: number | boolean | null;
};

function fromDb(row: GapDbRow): CompletenessInput {
  const min = Number(row.age_min_months) || 0;
  const max = Number(row.age_max_months) || 0;
  const agesConfirmed = row.ages_confirmed === 1 || row.ages_confirmed === true;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    city: row.city,
    province: row.province,
    phone: row.phone,
    website: row.website,
    licenseNumber: row.license_number,
    ageMinMonths: min,
    ageMaxMonths: max,
    agesKnown: agesConfirmed || (max > min && max > 0),
    infantMonthly: row.infant_monthly,
    toddlerMonthly: row.toddler_monthly,
    preschoolMonthly: row.preschool_monthly,
    partTimeMonthly: row.part_time_monthly,
    amenities: row.amenities,
    photos: row.photos,
    feeConfirmed: Boolean(row.claimed_at),
    claimed: Boolean(row.claimed_at),
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    claimStatus: row.claim_status,
    listingActive: row.listing_active === 0 || row.listing_active === false ? false : true,
    ratingX10: Number(row.rating_x10) || 0,
    reviewCount: Number(row.review_count) || 0,
    visibility: row.visibility,
    isTest: row.is_test,
  };
}

const LIST_SQL = `
select id, slug, name, address, city, province, phone, website, license_number,
  age_min_months, age_max_months, ages_confirmed,
  infant_monthly, toddler_monthly, preschool_monthly, part_time_monthly,
  amenities, photos, claimed_at, claim_status, listing_active,
  rating_x10, review_count, visibility, is_test
from daycares
where coalesce(listing_active, 1) <> 0
  and (
    city ilike '%winnipeg%'
    or city ilike '%winnpeg%'
    or city ~* '\\mwpg\\M'
  )
  and ${PUBLIC_LISTING_SQL}
order by name
`;

export type WinnipegGapClientRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  phone: string | null;
  website: string | null;
  licenseNumber: string | null;
  address: string;
  missingAges: boolean;
  missingFees: boolean;
  missingPhoto: boolean;
  hasRealPhoto: boolean;
  liveLooking: boolean;
  platformLive: boolean;
};

export type WinnipegGapReport = {
  database: string;
  summary: ReturnType<typeof summarizeLiveLooking>;
  rows: WinnipegGapClientRow[];
  csv: string;
};

function toClient(row: CompletenessInput): WinnipegGapClientRow {
  const gaps = liveLookingGaps(row);
  return {
    id: row.id || "",
    slug: row.slug || "",
    name: row.name || "",
    city: row.city || "",
    phone: row.phone || null,
    website: row.website || null,
    licenseNumber: row.licenseNumber || null,
    address: row.address || "",
    missingAges: gaps.includes("ages"),
    missingFees: gaps.includes("fees"),
    missingPhoto: gaps.includes("photo"),
    hasRealPhoto: hasRealPhoto(row),
    liveLooking: gaps.length === 0,
    platformLive: isPlatformLiveListing(row),
  };
}

export const listWinnipegGaps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WinnipegGapReport> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const dbRows = await sql.query<GapDbRow>(LIST_SQL);
    const listings = dbRows.map(fromDb).filter((row) => isSearchVisibleListing(row) && isWinnipegOutreachCity(row.city));
    const summary = summarizeLiveLooking(listings);
    const gaps = listings
      .filter((row) => liveLookingGaps(row).length > 0)
      .sort((a, b) => Number(hasRealPhoto(b)) - Number(hasRealPhoto(a)) || (a.name || "").localeCompare(b.name || ""));
    return {
      database: dbSource,
      summary,
      rows: gaps.map(toClient),
      csv: winnipegGapsCsv(listings),
    };
  });

function cleanPatch(input: FillPatch): FillPatch {
  return {
    id: String(input.id || "").trim(),
    ageMinMonths: input.ageMinMonths,
    ageMaxMonths: input.ageMaxMonths,
    infantMonthly: input.infantMonthly,
    toddlerMonthly: input.toddlerMonthly,
    preschoolMonthly: input.preschoolMonthly,
    partTimeMonthly: input.partTimeMonthly,
    photoUrl: input.photoUrl,
    source: input.source,
  };
}

export const applyWinnipegGaps = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { patches?: FillPatch[] }) => ({
    patches: Array.isArray(input?.patches) ? input.patches.slice(0, MAX_APPLY).map(cleanPatch) : [],
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    if (!data.patches.length) throw new Error("Nothing to apply");
    const sql = await getSql();
    const applied: string[] = [];
    const skipped: string[] = [];
    const rejected: Array<{ id: string; reason: string }> = [];
    for (const patch of data.patches) {
      if (!patch.id) {
        rejected.push({ id: "", reason: "Missing id" });
        continue;
      }
      const found = await sql.query<GapDbRow>(
        `select id, slug, name, address, city, province, phone, website, license_number,
           age_min_months, age_max_months, ages_confirmed,
           infant_monthly, toddler_monthly, preschool_monthly, part_time_monthly,
           amenities, photos, claimed_at, claim_status, listing_active,
           rating_x10, review_count, visibility, is_test
         from daycares where id = $1 limit 1`,
        [patch.id],
      );
      const current = found[0] ? fromDb(found[0]) : null;
      const city = current?.city || "";
      if (!current || !isWinnipegOutreachCity(city) || !isSearchVisibleListing(current)) {
        rejected.push({ id: patch.id, reason: "Not a public Winnipeg listing" });
        continue;
      }
      const plan = planCompletenessFill(current, patch);
      if (plan.action === "reject") {
        rejected.push({ id: patch.id, reason: plan.reason });
        continue;
      }
      if (plan.action !== "apply" || (!plan.setAges && !plan.setFees && !plan.setPhoto)) {
        skipped.push(patch.id);
        continue;
      }
      if (plan.setAges) {
        await sql.query(
          `update daycares
           set age_min_months = $2, age_max_months = $3, ages_confirmed = 1
           where id = $1
             and not (age_max_months > age_min_months and age_max_months > 0)
             and coalesce(ages_confirmed, 0) = 0`,
          [plan.id, plan.setAges.min, plan.setAges.max],
        );
      }
      if (plan.setFees) {
        await sql.query(
          `update daycares set
             infant_monthly = case when $2::int is null or coalesce(infant_monthly, 0) > 0 then infant_monthly else $2 end,
             toddler_monthly = case when $3::int is null or coalesce(toddler_monthly, 0) > 0 then toddler_monthly else $3 end,
             preschool_monthly = case when $4::int is null or coalesce(preschool_monthly, 0) > 0 then preschool_monthly else $4 end,
             part_time_monthly = case when $5::int is null or coalesce(part_time_monthly, 0) > 0 then part_time_monthly else $5 end
           where id = $1`,
          [
            plan.id,
            plan.setFees.infantMonthly ?? null,
            plan.setFees.toddlerMonthly ?? null,
            plan.setFees.preschoolMonthly ?? null,
            plan.setFees.partTimeMonthly ?? null,
          ],
        );
      }
      if (plan.setPhoto && !hasRealPhoto(current)) {
        await sql.query(
          `update daycares set photos = $2, last_photo_updated_at = now() where id = $1`,
          [plan.id, mergePhotoList(current.photos, plan.setPhoto)],
        );
      }
      const source = (patch.source || "").trim().slice(0, 400);
      if (source) {
        await sql.query(
          `update daycares set fact_source = case
             when coalesce(btrim(fact_source), '') = '' then $2
             when position($2 in fact_source) > 0 then fact_source
             else left(fact_source || ' | ' || $2, 500)
           end
           where id = $1`,
          [plan.id, source],
        );
      }
      applied.push(patch.id);
    }
    return { applied: applied.length, skipped: skipped.length, rejected };
  });
