/**
 * Read-only public catalogue totals for /api/health.
 * Ages stay the existing confirmed-flag count. Photos and fees follow the
 * same honesty rules as the listing cards: no placeholder, logo, or the
 * catalogue fee guess of 218. Fees count only when listing-level and cited
 * (see cited-fee.ts); city, provincial and program defaults do not.
 */
import { cityHubPlaceKeys, cityHubDefBySlug } from "./city-hubs.ts";
import { CITED_LISTING_FEE_SQL, REAL_LISTING_FEE_AMOUNT_SQL } from "./cited-fee.ts";
import { CITY_SEARCH_KEY_EXPR } from "./city-search-key.ts";
import { PUBLIC_LISTING_SQL } from "./listing-visibility.ts";

/** Same city keys as the Winnipeg hub, including Wpg and the Winnpeg spelling. */
export function winnipegHubCityKeys(): string[] {
  const hub = cityHubDefBySlug("winnipeg");
  return hub ? cityHubPlaceKeys(hub) : ["winnipeg"];
}

const WINNIPEG_CITY_SQL = winnipegHubCityKeys()
  .map((key) => `'${key.replace(/'/g, "")}'`)
  .join(", ");

export const CATALOG_COUNT_TTL_MS = 60_000;

export const CATALOG_COUNT_SQL = `
select
  count(*) filter (where ${PUBLIC_LISTING_SQL})::int as listings_total,
  count(distinct lower(btrim(slug))) filter (
    where ${PUBLIC_LISTING_SQL}
      and lower(btrim(coalesce(slug, ''))) not in ('', 'null', 'undefined')
      and length(btrim(coalesce(name, ''))) > 0
      and upper(btrim(coalesce(province, ''))) in ('MB', 'MANITOBA')
      and ${CITY_SEARCH_KEY_EXPR} in (${WINNIPEG_CITY_SQL})
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
      and ${REAL_LISTING_FEE_AMOUNT_SQL}
      and ${CITED_LISTING_FEE_SQL}
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
