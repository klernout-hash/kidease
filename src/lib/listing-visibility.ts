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
  visibility?: string | null;
  isTest?: boolean | number | null;
};

/** Known QA fixture — keep in sync with GHOST_LISTING / centres-extra-1.json. */
const KNOWN_ADMIN_ONLY_IDS = new Set(["ke-test-ghost-001"]);
const KNOWN_ADMIN_ONLY_SLUGS = new Set(["test-ghost-claim-lab"]);
const KNOWN_ADMIN_ONLY_LICENCES = new Set(["test-ghost-0001"]);

function norm(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/** Known QA fixture plus any row flagged admin_only / is_test. */
export function isAdminOnlyListing(d: ListingVisibilityInput | null | undefined): boolean {
  if (!d) return false;
  if (d.visibility === LISTING_VISIBILITY.adminOnly) return true;
  if (d.isTest === true || d.isTest === 1) return true;
  if (KNOWN_ADMIN_ONLY_SLUGS.has(norm(d.slug))) return true;
  if (KNOWN_ADMIN_ONLY_IDS.has(norm(d.id))) return true;
  if (KNOWN_ADMIN_ONLY_LICENCES.has(norm(d.licenseNumber))) return true;
  if (norm(d.name).includes("ghost claim lab")) return true;
  return false;
}

export function isPublicListing(d: ListingVisibilityInput | null | undefined): boolean {
  return !isAdminOnlyListing(d);
}

export function publicListings<T extends ListingVisibilityInput>(rows: T[]): T[] {
  return rows.filter((row) => isPublicListing(row));
}

export function listingVisibilityOf(d: ListingVisibilityInput): ListingVisibility {
  return isAdminOnlyListing(d) ? LISTING_VISIBILITY.adminOnly : LISTING_VISIBILITY.public;
}
