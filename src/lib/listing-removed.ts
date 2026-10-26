/**
 * Listings that must stay off KidEase.
 * Search, the map, sitemaps, APIs, JSON-LD, and the registry import all honour this list.
 * A later master import cannot insert the row again.
 * Relative imports only — Node tests load this file directly.
 */

/** Catalogue ids that are gone. */
export const REMOVED_LISTING_IDS = ["mx-09f81152743c"] as const;

/** Public slugs for those rows. The page is a 404, not a city redirect. */
export const REMOVED_LISTING_SLUGS = ["rupinder-singh-1152743c"] as const;

/**
 * Registry facility id for Rupinder Singh.
 * masterListingId("MB|home-rupinder-singh") is mx-09f81152743c.
 * Also matched against license_number when the import stored the source key there.
 */
export const REMOVED_LISTING_SOURCE_KEYS = ["MB|home-rupinder-singh"] as const;

/** Retired row marker. Not a merge and not a hidden-review redirect. */
export const REMOVED_LISTING_FAULT = "privacy_removed";

const SOURCE_KEYS = new Set(REMOVED_LISTING_SOURCE_KEYS.map((key) => key.toLowerCase()));

export function isRemovedListing(
  row: {
    id?: string | null;
    slug?: string | null;
    licenseNumber?: string | null;
    facilityId?: string | null;
  } | null | undefined,
): boolean {
  if (!row) return false;
  const id = String(row.id || "").trim().toLowerCase();
  const slug = String(row.slug || "").trim().toLowerCase();
  const license = String(row.licenseNumber || "").trim().toLowerCase();
  const facility = String(row.facilityId || "").trim().toLowerCase();
  if (id && (REMOVED_LISTING_IDS as readonly string[]).includes(id)) return true;
  if (slug && (REMOVED_LISTING_SLUGS as readonly string[]).includes(slug)) return true;
  if (license && SOURCE_KEYS.has(license)) return true;
  if (facility && SOURCE_KEYS.has(facility)) return true;
  return false;
}

/** Postgres fragment. Ids and source keys are fixed catalogue tokens. */
export function removedListingSql(): string {
  const ids = REMOVED_LISTING_IDS.map((id) => `'${id}'`).join(", ");
  const slugs = REMOVED_LISTING_SLUGS.map((slug) => `'${slug}'`).join(", ");
  const keys = REMOVED_LISTING_SOURCE_KEYS.map((key) => `'${key.replace(/'/g, "''")}'`).join(", ");
  return `id not in (${ids}) and lower(coalesce(slug, '')) not in (${slugs}) and lower(coalesce(license_number, '')) not in (${keys})`;
}
