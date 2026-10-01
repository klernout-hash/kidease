import { getPublicCatalog, type CatalogDaycare } from "@/lib/catalog";
import {
  cityHubNeedleKeys,
  directoryCountsFromGroups,
  directoryCountsFromRows,
  hubDef,
  listingBelongsToHub,
  type DirectoryCounts,
} from "@/lib/city-directory";
import { CITY_HUB_MIN_LISTINGS } from "@/lib/city-hubs";
import {
  isNeonCatalogPreferred,
  queryNeonCityHubListings,
  queryNeonDirectoryGroups,
} from "@/lib/server/catalog-neon";

export type LiveDirectoryCounts = DirectoryCounts & { source: "neon" | "json" };

const TTL_MS = 60_000;
let countCache: { at: number; value: LiveDirectoryCounts } | null = null;

function countsFromGroups(
  groups: Array<{ city: string | null; province: string | null; n: number }>,
): DirectoryCounts {
  return directoryCountsFromGroups(groups);
}

export async function loadDirectoryCounts(): Promise<LiveDirectoryCounts> {
  const now = Date.now();
  if (countCache && now - countCache.at < TTL_MS) return countCache.value;
  let value: LiveDirectoryCounts;
  try {
    if (await isNeonCatalogPreferred()) {
      const groups = await queryNeonDirectoryGroups();
      if (groups) {
        value = { ...countsFromGroups(groups), source: "neon" };
        countCache = { at: now, value };
        return value;
      }
    }
  } catch {
    /* JSON catalogue is the cold fallback, same as search. */
  }
  const rows = await getPublicCatalog();
  value = { ...directoryCountsFromRows(rows), source: "json" };
  countCache = { at: now, value };
  return value;
}

/** Same public rows a city hub count uses. Cap matches a full major-city directory. */
export async function listingsForCityHub(slug: string): Promise<CatalogDaycare[]> {
  const def = hubDef(slug);
  if (!def) return [];
  try {
    if (await isNeonCatalogPreferred()) {
      const neon = await queryNeonCityHubListings(def.province, cityHubNeedleKeys(def));
      if (neon) return neon.filter((row) => listingBelongsToHub(row, def));
    }
  } catch {
    /* JSON fallback */
  }
  const rows = await getPublicCatalog();
  return rows.filter((row) => listingBelongsToHub(row, def));
}

export async function liveHubCount(slug: string): Promise<number | null> {
  const counts = await loadDirectoryCounts();
  const n = counts.hubs[slug];
  if (typeof n !== "number" || n < CITY_HUB_MIN_LISTINGS) return null;
  return n;
}
