/**
 * Listing slug generation and known-typo remaps.
 * Only letter-swap tokens (cetnre → centre). No SEO rewrites.
 * Node tests load this via .ts specifiers.
 */

/** Hyphenated slug tokens we refuse to persist. Inverse is used for old-URL lookup. */
export const LISTING_SLUG_TOKEN_FIXES: Readonly<Record<string, string>> = {
  cetnre: "centre",
  cetnres: "centres",
};

const SLUG_TOKEN_INVERSES: Readonly<Record<string, string>> = {
  centre: "cetnre",
  centres: "cetnres",
};

function lastPathSegment(slug: string): string {
  return String(slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .pop() ?? "";
}

function mapSlugTokens(slug: string, table: Readonly<Record<string, string>>): string {
  if (!slug) return "";
  return slug
    .split("-")
    .map((token) => table[token.toLowerCase()] ?? token)
    .join("-");
}

/** Registry name letter-swaps we refuse to show or persist. */
export function correctCentreNameTypos(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\bCetnres\b/g, "Centres")
    .replace(/\bCetnre\b/g, "Centre")
    .replace(/\bcetnres\b/g, "centres")
    .replace(/\bcetnre\b/g, "centre");
}

/** Rewrite known typo tokens. Leaves every other segment untouched. */
export function normalizeListingSlug(slug: string | null | undefined): string {
  const segment = lastPathSegment(String(slug ?? ""));
  if (!segment) return "";
  return mapSlugTokens(segment, LISTING_SLUG_TOKEN_FIXES);
}

/** Requested slug plus the corrected / historical typo form so old links resolve. */
export function listingSlugLookupKeys(slug: string | null | undefined): string[] {
  const raw = lastPathSegment(String(slug ?? ""));
  if (!raw) return [];
  const canonical = normalizeListingSlug(raw);
  const typo = mapSlugTokens(raw, SLUG_TOKEN_INVERSES);
  const keys: string[] = [];
  for (const key of [raw, canonical, typo]) {
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function listingSlugFromName(name: string, suffix = ""): string {
  const cleaned = correctCentreNameTypos(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  const base = (normalizeListingSlug(cleaned) || "centre").slice(0, 70);
  const id = String(suffix || "").trim();
  return id ? `${base}-${id}` : base;
}

/** Index canonical slugs and their typo aliases onto the same row. */
export function rememberSlugAliases<T extends { slug: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    for (const key of listingSlugLookupKeys(row.slug)) {
      if (!map.has(key)) map.set(key, row);
    }
  }
  return map;
}
