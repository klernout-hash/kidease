/**
 * Read-only public catalogue totals for /api/health.
 * Ages stay the existing confirmed-flag count. Photos and fees follow the
 * same honesty rules as the listing cards: no placeholder, logo, or the
 * catalogue fee guess of 218.
 */
import { PUBLIC_LISTING_SQL } from "./listing-visibility.ts";

export const CATALOG_COUNT_TTL_MS = 60_000;

export const CATALOG_COUNT_SQL = `
select
  count(*) filter (where ${PUBLIC_LISTING_SQL})::int as listings_total,
  count(*) filter (
    where ${PUBLIC_LISTING_SQL}
      and (
        lower(btrim(coalesce(city, ''))) like '%winnipeg%'
        or lower(btrim(coalesce(city, ''))) like '%winnpeg%'
      )
  )::int as winnipeg_total,
  count(*) filter (
    where ${PUBLIC_LISTING_SQL}
      and photos is not null
      and length(btrim(photos)) > 2
      and photos !~* 'placeholder'
      and photos !~* '-logo'
      and (
        photos ~ '/photos/buildings/'
        or photos ~ '/img/'
        or photos ~* 'https?://'
      )
  )::int as photos_confirmed,
  count(*) filter (
    where ${PUBLIC_LISTING_SQL}
      and (
        (coalesce(infant_monthly, 0) > 0 and coalesce(infant_monthly, 0) <> 218)
        or (coalesce(toddler_monthly, 0) > 0 and coalesce(toddler_monthly, 0) <> 218)
        or (coalesce(preschool_monthly, 0) > 0 and coalesce(preschool_monthly, 0) <> 218)
        or (coalesce(part_time_monthly, 0) > 0 and coalesce(part_time_monthly, 0) <> 218)
        or lower(btrim(coalesce(fee_program, ''))) in (
          'mb-10-day', 'bc-10-day', 'pe-10-day', 'nl-10-day', 'yt-reduced', 'nt-reduced'
        )
      )
  )::int as fees_confirmed,
  count(*) filter (where ${PUBLIC_LISTING_SQL} and coalesce(ages_confirmed, 0) = 1)::int as ages_confirmed
from daycares
`;

export type CatalogCounts = {
  catalogCount: number;
  listingsTotal: number;
  winnipegTotal: number;
  photosConfirmed: number;
  feesConfirmed: number;
  agesConfirmed: number;
};

export function catalogCountsFromRow(row: Record<string, unknown> | null | undefined): CatalogCounts | null {
  if (!row) return null;
  const num = (key: string) => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  };
  const listingsTotal = num("listings_total");
  const winnipegTotal = num("winnipeg_total");
  const photosConfirmed = num("photos_confirmed");
  const feesConfirmed = num("fees_confirmed");
  const agesConfirmed = num("ages_confirmed");
  if (
    listingsTotal == null ||
    winnipegTotal == null ||
    photosConfirmed == null ||
    feesConfirmed == null ||
    agesConfirmed == null
  ) {
    return null;
  }
  return {
    catalogCount: listingsTotal,
    listingsTotal,
    winnipegTotal,
    photosConfirmed,
    feesConfirmed,
    agesConfirmed,
  };
}
