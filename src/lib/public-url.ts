import { looksLikeTestFixture } from "./listing-fixture.ts";

/** Canonical public URL helpers; independent of catalogue filtering and sitemap generation. */
export const SITEMAP_ORIGIN = "https://www.kidease.ca";

export function sitemapListingPath(slug: string): string {
  return `/daycare/${slug}`;
}

const BLOCKED_SITEMAP_SLUGS = new Set(["test-ghost", "test-ghost-claim-lab"]);

/**
 * Catalogue slugs are alphanumeric plus hyphens. Repeated and trailing hyphens
 * are real (truncated registry names such as "la-bulle-de-lait-"). They are
 * still one path segment — no slash, space, or dot.
 */
const SLUG_RE = /^[a-z0-9]+(?:-*[a-z0-9]+)*-*$/i;

export function isSafeSitemapSlug(slug: string | null | undefined): boolean {
  const value = (slug || "").trim();
  if (!value || value.length > 80) return false;
  if (/^(null|undefined)$/i.test(value)) return false;
  if (!SLUG_RE.test(value)) return false;
  if (BLOCKED_SITEMAP_SLUGS.has(value.toLowerCase())) return false;
  if (looksLikeTestFixture({ slug: value })) return false;
  return true;
}
