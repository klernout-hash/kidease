import { getPublicCatalog, getPublicCatalogResult, type CatalogDaycare } from "@/lib/catalog";
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
  queryNeonCityHubListingsResult,
  queryNeonDirectoryGroups,
} from "@/lib/server/catalog-neon";
import { searchEvidence, withSearchRows, type SearchBatch, type SearchReadOptions } from "@/lib/search-evidence";

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
  return (await listingsForCityHubResult(slug)).rows;
}

export async function listingsForCityHubResult(slug: string, opts?: SearchReadOptions): Promise<SearchBatch<CatalogDaycare>> {
  const def = hubDef(slug);
  if (!def) return { rows: [], evidence: searchEvidence({ status: "complete", source: "primary", retryable: false }) };
  let primaryUnavailable = false;
  try {
    if (await isNeonCatalogPreferred(undefined, opts)) {
      const neon = await queryNeonCityHubListingsResult(def.province, cityHubNeedleKeys(def), opts);
      if (neon) return withSearchRows(neon, neon.rows.filter((row) => listingBelongsToHub(row, def)));
      primaryUnavailable = true;
    }
  } catch {
    primaryUnavailable = true;
    /* JSON fallback */
  }
  const batch = await getPublicCatalogResult(opts);
  const filtered = withSearchRows(batch, batch.rows.filter((row) => listingBelongsToHub(row, def)));
  if (!primaryUnavailable || batch.evidence.source === "primary") return filtered;
  return {
    rows: filtered.rows,
    evidence: searchEvidence({
      ...batch.evidence,
      status: "unverified",
      reasons: [...batch.evidence.reasons, "source-fallback", "source-unavailable"],
      retryable: true,
    }),
  };
}

export async function liveHubCount(slug: string): Promise<number | null> {
  const counts = await loadDirectoryCounts();
  const n = counts.hubs[slug];
  if (typeof n !== "number" || n < CITY_HUB_MIN_LISTINGS) return null;
  return n;
}
