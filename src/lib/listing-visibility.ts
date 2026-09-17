import { isKidEaseOperatorEmail } from "./admin-email.ts";

export const LISTING_VISIBILITY = {
  public: "public",
  adminOnly: "admin_only",
} as const;

export type ListingVisibility = (typeof LISTING_VISIBILITY)[keyof typeof LISTING_VISIBILITY];

/** Fields used to decide whether a listing may appear on public surfaces. */
export type ListingVisibilityInput = {
  id?: string | null;
  daycareId?: string | null;
  slug?: string | null;
  name?: string | null;
  licenseNumber?: string | null;
  address?: string | null;
  visibility?: string | null;
  isTest?: boolean | number | null;
};

/** Known QA fixture — keep in sync with GHOST_LISTING / centres-extra-1.json / request-guard HIDDEN_LISTING_SLUGS. */
const KNOWN_ADMIN_ONLY_IDS = new Set(["ke-test-ghost-001"]);
const KNOWN_ADMIN_ONLY_SLUGS = new Set([
  "test-ghost",
  "test-ghost-claim-lab",
  "test-test-p23f",
  "test-test-nozo",
  "test-test-p2tk",
]);
const KNOWN_ADMIN_ONLY_LICENCES = new Set(["test-ghost-0001"]);

/**
 * Real Live centres that stay public even when the operator mailbox is linked.
 * Kids World (Edmonton, licence 70051797) is a production centre, not a fixture.
 */
export const PUBLIC_LIVE_KEEP_SLUGS = new Set(["kids-world-daycare-kh2t"]);

/**
 * Kyle's claimed catalogue fixture. Same admin-only signal as TEST/ghost rows
 * so Live search, the map, and "Show QA fixtures" share one check.
 */
const KNOWN_OPERATOR_QA_SLUGS = new Set(["peninsula-montessori-academy-oak-3572"]);
const KNOWN_OPERATOR_QA_IDS = new Set(["bc-3572"]);

/**
 * Case-insensitive QA prefixes. Require a separator or end-of-string so
 * "Teston" / "Testing Academy" stay public. The old /^TEST[ _-]/ heuristic
 * missed Title Case "Test Test" rows on production.
 */
export const QA_FIXTURE_NAME_RE = /^test([ _-]|$)/i;
export const QA_FIXTURE_QA_NAME_RE = /^qa[ _-]/i;
export const QA_FIXTURE_SLUG_RE = /^test([_-]|$)/i;
export const QA_FIXTURE_QA_SLUG_RE = /^qa[_-]/i;

function norm(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/**
 * Leftover QA rows that look like real centres: TEST / Test / qa prefixes,
 * ghost-claim copy, ke-test- ids, TEST- licences, KidEase Test Lane.
 * Separator after "test" so "Teston" / "Testing Academy" stay public.
 */
export function looksLikeTestFixture(d: ListingVisibilityInput | null | undefined): boolean {
  if (!d) return false;
  const id = norm(d.id || d.daycareId);
  const slug = norm(d.slug);
  const license = norm(d.licenseNumber);
  const name = (d.name || "").trim();
  const nameLc = name.toLowerCase();
  const address = norm(d.address);
  if (KNOWN_ADMIN_ONLY_SLUGS.has(slug) || slug.startsWith("test-ghost-") || slug.includes("ghost-listing")) return true;
  if (KNOWN_OPERATOR_QA_SLUGS.has(slug) || KNOWN_OPERATOR_QA_IDS.has(id)) return true;
  if (license === "3572" && nameLc.startsWith("peninsula montessori academy oak")) return true;
  if (QA_FIXTURE_SLUG_RE.test(slug) || QA_FIXTURE_QA_SLUG_RE.test(slug) || slug === "qa") return true;
  if (KNOWN_ADMIN_ONLY_IDS.has(id) || id.startsWith("ke-test-")) return true;
  if (KNOWN_ADMIN_ONLY_LICENCES.has(license) || license.startsWith("test-")) return true;
  if (QA_FIXTURE_NAME_RE.test(name) || QA_FIXTURE_QA_NAME_RE.test(name) || nameLc === "qa") return true;
  if (/\bqa\s+test\b/i.test(name)) return true;
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
  return rows.filter((row) => {
    // Server-mapped Admin rows already set isTest. Trust that so a public
    // waiting claim (Joan / Kids World) cannot be dropped by a missing `id`.
    if (row.isTest === true || row.isTest === 1) return false;
    if (row.isTest === false || row.isTest === 0) return true;
    return !isAdminOnlyListing(row);
  });
}

export function listingVisibilityOf(d: ListingVisibilityInput): ListingVisibility {
  return isAdminOnlyListing(d) ? LISTING_VISIBILITY.adminOnly : LISTING_VISIBILITY.public;
}

/** Persist flags for createListing / catalogue upserts so QA names cannot stay public. */
export function listingVisibilityWrite(d: ListingVisibilityInput): {
  visibility: ListingVisibility;
  isTest: 0 | 1;
} {
  if (isAdminOnlyListing(d)) {
    return { visibility: LISTING_VISIBILITY.adminOnly, isTest: 1 };
  }
  return { visibility: LISTING_VISIBILITY.public, isTest: 0 };
}

/**
 * Operator mailbox (kyle@kidease.ca) claims are QA fixtures. Persist the same
 * is_test / admin_only flag Admin uses for "Show QA fixtures". Kids World stays public.
 */
export function isOperatorQaOwner(email: string | null | undefined, slug?: string | null): boolean {
  if (PUBLIC_LIVE_KEEP_SLUGS.has(norm(slug))) return false;
  return isKidEaseOperatorEmail(email);
}

export function listingVisibilityForOwners(
  listing: ListingVisibilityInput,
  ownerEmails: Array<string | null | undefined>,
): { visibility: ListingVisibility; isTest: 0 | 1 } {
  if (PUBLIC_LIVE_KEEP_SLUGS.has(norm(listing.slug))) {
    return { visibility: LISTING_VISIBILITY.public, isTest: 0 };
  }
  if (ownerEmails.some((email) => isOperatorQaOwner(email, listing.slug))) {
    return { visibility: LISTING_VISIBILITY.adminOnly, isTest: 1 };
  }
  return listingVisibilityWrite(listing);
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
 * Flags plus leftover TEST/Test/qa/ghost rows that were never marked is_test.
 * Name/slug prefixes are case-insensitive; "Teston" does not match ^test([ _-]|$).
 */
export const PUBLIC_LISTING_SQL = `(
  coalesce(is_test, 0) = 0
  and coalesce(visibility, 'public') = 'public'
  and id not ilike 'ke-test-%'
  and slug not ilike 'test-ghost%'
  and coalesce(license_number, '') not ilike 'TEST-%'
  and name !~* '^test([ _-]|$)'
  and slug !~* '^test([_-]|$)'
  and name !~* '^qa[ _-]'
  and slug !~* '^qa[_-]'
  and lower(btrim(coalesce(name, ''))) not in ('test', 'qa')
  and lower(btrim(coalesce(slug, ''))) not in ('test', 'qa')
  and name not ilike '%qa test%'
  and slug not ilike '%ghost-listing%'
  and name not ilike '%ghost claim%'
  and name not ilike '%ghost listing%'
  and coalesce(address, '') not ilike '%kidease test%'
  and slug <> 'peninsula-montessori-academy-oak-3572'
  and id <> 'bc-3572'
  and name !~* '^peninsula montessori academy oak'
)`;
