/**
 * When a bundled catalogue copy may stand in for a database row.
 * A hidden, inactive, or retired row that exists in the database is never
 * replaced by the older copy shipped in the site build. The bundle is only
 * for a slug the database does not have, or for a database that did not answer.
 */

import { followMergedListing, type MergedHop } from "./listing-merge.ts";
import { normalizeListingSlug } from "./listing-slug.ts";

export type CatalogDbState = "found" | "missing" | "unreachable";

export type SuppressedCatalogKeys = {
  ids: ReadonlySet<string>;
  slugs: ReadonlySet<string>;
};

/**
 * Follow merged_into to the keeper. A row that exists but cannot be followed
 * (hidden import fault, dangling keeper) is returned as itself so callers do
 * not treat it as "not in the database".
 */
export function resolveFoundCatalogRow<T extends MergedHop>(
  exact: T,
  lookup: (id: string) => T | undefined,
): T {
  const resolved = followMergedListing(exact, lookup);
  if (!resolved) return exact;
  return lookup(resolved.id) ?? resolved;
}

/** Found database rows win. Missing and unreachable lookups may use the bundle. */
export function chooseCatalogListing<T>(input: {
  dbState: CatalogDbState;
  db: T | null | undefined;
  bundle: T | null | undefined;
}): T | null | undefined {
  if (input.dbState === "found") return input.db ?? null;
  return input.bundle;
}

export function suppressedCatalogKey(value: string | null | undefined): string {
  return normalizeListingSlug(value).toLowerCase();
}

/** `keys === null` means the database did not answer — keep every bundled row. */
export function filterSuppressedCatalogRows<T extends { id?: string | null; slug?: string | null }>(
  rows: readonly T[],
  keys: SuppressedCatalogKeys | null,
): T[] {
  if (!keys) return [...rows];
  return rows.filter((row) => {
    const id = String(row.id || "").trim();
    if (id && keys.ids.has(id)) return false;
    const slug = suppressedCatalogKey(row.slug);
    if (slug && keys.slugs.has(slug)) return false;
    return true;
  });
}
