/**
 * Last search results for the Capacitor app.
 * FEATURE_OFFLINE_CACHE defaults off. No photos, so no child faces.
 * The website does not write this cache.
 */

export const OFFLINE_CACHE_FLAG = "FEATURE_OFFLINE_CACHE";
export const OFFLINE_SEARCH_KEY = "ke-offline-search";
export const OFFLINE_SEARCH_MAX = 40;

export type OfflineSearchRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
};

export type OfflineSearchRecord = {
  savedAt: string;
  query: string;
  rows: OfflineSearchRow[];
};

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function offlineCacheEnabled(env?: Record<string, string | undefined>): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[OFFLINE_CACHE_FLAG]) || flagOn(bag[`VITE_${OFFLINE_CACHE_FLAG}`]);
}

export function offlineSearchRecord(input: {
  enabled: boolean;
  native: boolean;
  query: string;
  rows: readonly OfflineSearchRow[];
  now?: Date;
}): OfflineSearchRecord | null {
  if (!input.enabled || !input.native) return null;
  const seen = new Set<string>();
  const rows: OfflineSearchRow[] = [];
  for (const row of input.rows) {
    const id = row.id.trim();
    const slug = row.slug.trim();
    const name = row.name.trim();
    if (!id || !slug || !name || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, slug, name, city: row.city.trim() });
    if (rows.length >= OFFLINE_SEARCH_MAX) break;
  }
  if (!rows.length) return null;
  return {
    savedAt: (input.now ?? new Date()).toISOString(),
    query: input.query.trim().slice(0, 80),
    rows,
  };
}

export async function writeOfflineSearch(
  record: OfflineSearchRecord | null,
  storage: { set: (key: string, value: string) => Promise<void> },
): Promise<boolean> {
  if (!record) return false;
  await storage.set(OFFLINE_SEARCH_KEY, JSON.stringify(record));
  return true;
}
