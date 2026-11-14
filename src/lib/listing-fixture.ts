/** Fixture-only predicates; no catalogue data, SQL construction, or runtime imports. */
import type { ListingVisibilityInput } from "./listing-visibility.ts";

/** Known QA fixture — keep in sync with GHOST_LISTING / centres-extra-1.json / request-guard HIDDEN_LISTING_SLUGS. */
export const KNOWN_ADMIN_ONLY_IDS = new Set(["ke-test-ghost-001"]);
export const KNOWN_ADMIN_ONLY_SLUGS = new Set([
  "test-ghost",
  "test-ghost-claim-lab",
  "test-test-p23f",
  "test-test-nozo",
  "test-test-p2tk",
]);
export const KNOWN_ADMIN_ONLY_LICENCES = new Set(["test-ghost-0001"]);

/**
 * Real Live centres that stay public even when the operator mailbox is linked.
 * Kids World (Edmonton, licence 70051797) is a production centre, not a fixture.
 */
export const PUBLIC_LIVE_KEEP_SLUGS = new Set(["kids-world-daycare-kh2t"]);

/**
 * Slugs that look like QA fixtures but must stay on the public catalogue.
 * qa-test-daycare-listing-z5hz is a hidden QA centre, so this set stays empty.
 */
export const PUBLIC_CATALOGUE_SLUGS = new Set<string>();

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
  if (PUBLIC_CATALOGUE_SLUGS.has(slug)) return false;
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
  // e.g. "KidEase Test Daycare (QA)": trailing (QA)/[QA]/(Test) tag or a "KidEase Test" name.
  if (/[([]\s*(qa|test)\s*[)\]]\s*$/i.test(name) || /\bkidease\s+test\b/i.test(name)) return true;
  if (isDocuSignSmokeCentre(name)) return true;
  if (nameLc.includes("ghost claim") || nameLc.includes("ghost listing") || nameLc === "ghost listing") return true;
  if (address.includes("kidease test")) return true;
  return false;
}

/** DocuSign webhook smoke row. Not a real centre. Hidden from every non-admin desk. */
export function isDocuSignSmokeCentre(name: string | null | undefined): boolean {
  return /docusign\s+smoke/i.test(String(name || ""));
}
