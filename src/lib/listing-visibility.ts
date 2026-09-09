export const LISTING_VISIBILITY = {
  public: "public",
  adminOnly: "admin_only",
} as const;

export type ListingVisibility = (typeof LISTING_VISIBILITY)[keyof typeof LISTING_VISIBILITY];

/** Fields used to decide whether a listing may appear on public surfaces. */
export type ListingVisibilityInput = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  licenseNumber?: string | null;
  address?: string | null;
  visibility?: string | null;
  isTest?: boolean | number | null;
};

/** Known QA fixture — keep in sync with GHOST_LISTING / centres-extra-1.json / request-guard HIDDEN_LISTING_SLUGS. */
const KNOWN_ADMIN_ONLY_IDS = new Set(["ke-test-ghost-001"]);
const KNOWN_ADMIN_ONLY_SLUGS = new Set(["test-ghost", "test-ghost-claim-lab"]);
const KNOWN_ADMIN_ONLY_LICENCES = new Set(["test-ghost-0001"]);

function norm(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/**
 * Leftover QA rows that look like real centres: uppercase TEST prefix,
 * ghost-claim copy, ke-test- ids, TEST- licences, KidEase Test Lane.
 * Case-sensitive TEST + space so "Teston" / "Testing Academy" stay public.
 */
export function looksLikeTestFixture(d: ListingVisibilityInput | null | undefined): boolean {
  if (!d) return false;
  const id = norm(d.id);
  const slug = norm(d.slug);
  const license = norm(d.licenseNumber);
  const name = (d.name || "").trim();
  const nameLc = name.toLowerCase();
  const address = norm(d.address);
  if (KNOWN_ADMIN_ONLY_SLUGS.has(slug) || slug === "test-ghost" || slug.startsWith("test-ghost-") || slug.includes("ghost-listing")) return true;
  if (KNOWN_ADMIN_ONLY_IDS.has(id) || id.startsWith("ke-test-")) return true;
  if (KNOWN_ADMIN_ONLY_LICENCES.has(license) || license.startsWith("test-")) return true;
  if (/^TEST[\s\-_]/.test(name)) return true;
  if (nameLc.includes("ghost claim") || nameLc.includes("ghost listing") || nameLc === "ghost listing") return true;
  if (address.includes("kidease test")) return true;
  return false;
}

/** Known QA fixture plus any row flagged admin_only / is_test. */
export function isAdminOnlyListing(d: ListingVisibilityInput | null | undefined): boolean {
  if (!d) return false;
  if (d.visibility === LISTING_VISIBILITY.adminOnly) return true;
  if (d.isTest === true || d.isTest === 1) return true;
  return looksLikeTestFixture(d);
}

export function isPublicListing(d: ListingVisibilityInput | null | undefined): boolean {
  return !isAdminOnlyListing(d);
}

export function publicListings<T extends ListingVisibilityInput>(rows: T[]): T[] {
  return rows.filter((row) => isPublicListing(row));
}

/** Staff queues default to production claims. QA / ghost / Claim Lab stay opt-in. */
export function staffQueueRows<T extends ListingVisibilityInput>(rows: T[], includeQa: boolean): T[] {
  if (includeQa) return rows;
  return rows.filter((row) => !isAdminOnlyListing(row));
}

export function listingVisibilityOf(d: ListingVisibilityInput): ListingVisibility {
  return isAdminOnlyListing(d) ? LISTING_VISIBILITY.adminOnly : LISTING_VISIBILITY.public;
}

/** Map a daycares row onto the visibility helper without dropping name/slug heuristics. */
export function listingVisibilityInputFromDb(row: {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  license_number?: string | null;
  address?: string | null;
  visibility?: string | null;
  is_test?: boolean | number | null;
}): ListingVisibilityInput {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    licenseNumber: row.license_number,
    address: row.address,
    visibility: row.visibility === LISTING_VISIBILITY.adminOnly ? LISTING_VISIBILITY.adminOnly : row.visibility,
    isTest: row.is_test,
  };
}

/**
 * Postgres predicate for parent-facing catalogue queries.
 * Flags plus leftover TEST/ghost rows that were never marked is_test.
 */
export const PUBLIC_LISTING_SQL = `(
  coalesce(is_test, 0) = 0
  and coalesce(visibility, 'public') = 'public'
  and id not ilike 'ke-test-%'
  and slug not ilike 'test-ghost%'
  and coalesce(license_number, '') not ilike 'TEST-%'
  and name not like 'TEST %'
  and name not like 'TEST-%'
  and name not like 'TEST_%'
  and slug not ilike '%ghost-listing%'
  and name not ilike '%ghost claim%'
  and name not ilike '%ghost listing%'
  and coalesce(address, '') not ilike '%kidease test%'
)`;
