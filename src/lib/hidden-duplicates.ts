/**
 * Audited duplicate listings from data/ops/merge-duplicates-20261001.csv.
 * The copy stays out of search, hubs, and the sitemap. Its URL 301s to the keeper.
 * kids-world-daycare-kh2t is not in this map.
 */

import keepers from "./data/hidden-duplicate-keepers.json" with { type: "json" };

const KEEPERS: Record<string, string> = keepers;

export function hiddenDuplicateKeeper(slug: string | null | undefined): string | null {
  const current = String(slug ?? "").trim().toLowerCase();
  if (!current || !KEEPERS[current]) return null;
  const seen = new Set<string>();
  let keeper = KEEPERS[current];
  for (let hop = 0; hop < 4 && keeper; hop += 1) {
    const key = keeper.trim().toLowerCase();
    if (!key || seen.has(key)) break;
    seen.add(key);
    const next = KEEPERS[key];
    if (!next) return keeper;
    keeper = next;
  }
  return keeper;
}

export function isHiddenDuplicateSlug(slug: string | null | undefined): boolean {
  const key = String(slug ?? "").trim().toLowerCase();
  return Boolean(key && KEEPERS[key]);
}

/** Postgres fragment. Slugs are catalogue tokens, so quotes are rejected. */
export function hiddenDuplicateSlugSql(): string {
  const slugs = Object.keys(KEEPERS).filter((slug) => /^[a-z0-9-]+$/.test(slug));
  if (slugs.length === 0) return "true";
  return `lower(slug) not in (${slugs.map((slug) => `'${slug}'`).join(",")})`;
}
