/**
 * First-slice city hubs for licensed daycare directories.
 * Only cities with real catalogue density. No empty doorways.
 * Relative .ts imports so Node tests can load this file.
 */

import { isAdminOnlyListing } from "./listing-visibility.ts";
import { normalizeListingSlug } from "./listing-slug.ts";
import { isSafeSitemapSlug, SITEMAP_ORIGIN } from "./sitemap.ts";

export const CITY_HUB_PATH_PREFIX = "/daycare/city";
export const CITY_HUB_LISTING_CAP = 80;
export const CITY_HUB_MIN_LISTINGS = 20;

export type CityHubDef = {
  slug: string;
  city: string;
  province: string;
  subsidyUrl: string;
  subsidyLabel: string;
};

/**
 * Home city chips that already have real listing density.
 * Slugs stay ASCII so URLs do not depend on accents.
 */
export const CITY_HUB_DEFS: readonly CityHubDef[] = [
  {
    slug: "winnipeg",
    city: "Winnipeg",
    province: "MB",
    subsidyUrl: "https://www.gov.mb.ca/education/childcare/families/childcare_subsidies.html",
    subsidyLabel: "Manitoba Child Care Subsidy",
  },
  {
    slug: "toronto",
    city: "Toronto",
    province: "ON",
    subsidyUrl: "https://www.ontario.ca/page/child-care-subsidies",
    subsidyLabel: "Ontario child care subsidies",
  },
  {
    slug: "montreal",
    city: "Montréal",
    province: "QC",
    subsidyUrl: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/",
    subsidyLabel: "Quebec childcare tax credit",
  },
  {
    slug: "vancouver",
    city: "Vancouver",
    province: "BC",
    subsidyUrl: "https://www.gov.bc.ca/affordablechildcarebenefit",
    subsidyLabel: "B.C. Affordable Child Care Benefit",
  },
  {
    slug: "calgary",
    city: "Calgary",
    province: "AB",
    subsidyUrl: "https://www.alberta.ca/child-care-subsidy",
    subsidyLabel: "Alberta Child Care Subsidy",
  },
  {
    slug: "ottawa",
    city: "Ottawa",
    province: "ON",
    subsidyUrl: "https://www.ontario.ca/page/child-care-subsidies",
    subsidyLabel: "Ontario child care subsidies",
  },
];

export type CityHubListing = {
  slug: string;
  name: string;
};

export type CityHubSnapshot = {
  slug: string;
  city: string;
  province: string;
  subsidyUrl: string;
  subsidyLabel: string;
  count: number;
  listings: CityHubListing[];
};

type HubSourceRow = {
  slug?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
  visibility?: string | null;
  isTest?: boolean | number | null;
  id?: string | null;
  licenseNumber?: string | null;
  address?: string | null;
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeCityKey(value: string | null | undefined) {
  return stripAccents(String(value ?? ""))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cityHubPath(slug: string) {
  return `${CITY_HUB_PATH_PREFIX}/${slug}`;
}

export function cityHubUrl(slug: string) {
  return `${SITEMAP_ORIGIN}${cityHubPath(slug)}`;
}

export function cityHubDefBySlug(slug: string | null | undefined) {
  const key = normalizeCityKey(slug).replace(/\s+/g, "");
  return CITY_HUB_DEFS.find((hub) => hub.slug === key) ?? null;
}

export function cityHubDefForPlace(city: string | null | undefined, province: string | null | undefined) {
  const cityKey = normalizeCityKey(city);
  const provinceKey = String(province ?? "")
    .trim()
    .toUpperCase();
  if (!cityKey || !provinceKey) return null;
  return (
    CITY_HUB_DEFS.find(
      (hub) => normalizeCityKey(hub.city) === cityKey && hub.province === provinceKey,
    ) ?? null
  );
}

function compareListingName(a: CityHubListing, b: CityHubListing) {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

export function buildCityHubSnapshots(
  rows: HubSourceRow[],
  listingCap = CITY_HUB_LISTING_CAP,
): CityHubSnapshot[] {
  const buckets = new Map<string, { def: CityHubDef; listings: CityHubListing[] }>();
  for (const def of CITY_HUB_DEFS) {
    buckets.set(def.slug, { def, listings: [] });
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (isAdminOnlyListing(row)) continue;
    const slug = normalizeListingSlug((row.slug || "").trim());
    if (!isSafeSitemapSlug(slug)) continue;
    const def = cityHubDefForPlace(row.city, row.province);
    if (!def) continue;
    const name = String(row.name || "").replace(/\s{2,}/g, " ").trim();
    if (!name) continue;
    const key = `${def.slug}:${slug.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    buckets.get(def.slug)?.listings.push({ slug, name });
  }

  const out: CityHubSnapshot[] = [];
  for (const def of CITY_HUB_DEFS) {
    const listings = (buckets.get(def.slug)?.listings ?? []).sort(compareListingName);
    if (listings.length < CITY_HUB_MIN_LISTINGS) continue;
    out.push({
      slug: def.slug,
      city: def.city,
      province: def.province,
      subsidyUrl: def.subsidyUrl,
      subsidyLabel: def.subsidyLabel,
      count: listings.length,
      listings: listings.slice(0, listingCap),
    });
  }
  return out;
}

export function sitemapCityHubPaths(hubs: ReadonlyArray<{ slug: string; count?: number }> = CITY_HUB_DEFS) {
  return hubs
    .filter((hub) => (hub.count ?? CITY_HUB_MIN_LISTINGS) >= CITY_HUB_MIN_LISTINGS)
    .map((hub) => cityHubPath(hub.slug));
}
