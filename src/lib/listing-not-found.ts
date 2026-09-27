/** Public listing document is missing, hidden, or admin-only. */
export const LISTING_NOT_FOUND_TITLE = "Listing not found · KidEase";
export const LISTING_NOT_FOUND_DESCRIPTION =
  "This centre is not on KidEase, or the link is out of date.";

export function listingNotFoundHead() {
  return {
    meta: [
      { title: LISTING_NOT_FOUND_TITLE },
      { name: "description", content: LISTING_NOT_FOUND_DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

/** True when getListingSeo returned nothing the public can see. */
export function shouldNotFoundListing(seo: { slug?: string | null } | null | undefined): boolean {
  return !seo?.slug;
}

export type ListingLoaderHidden =
  | { kind: "city"; city: string }
  | { kind: "search"; q: string }
  | null;

/**
 * Public listing loader. A different slug is the merged keeper (301).
 * A missing document with a hidden-review place redirects to that city or
 * search. Anything else is a hard 404 — never the bundled catalogue copy.
 */
export function decideListingLoader<T extends { slug?: string | null }>(
  requestedSlug: string,
  seo: T | null | undefined,
  hidden: ListingLoaderHidden,
):
  | { type: "render"; seo: T }
  | { type: "redirect-keeper"; slug: string }
  | { type: "redirect-city"; city: string }
  | { type: "redirect-search"; q: string }
  | { type: "not-found" } {
  if (seo?.slug && seo.slug !== requestedSlug) {
    return { type: "redirect-keeper", slug: seo.slug };
  }
  if (!seo?.slug) {
    if (hidden?.kind === "city") return { type: "redirect-city", city: hidden.city };
    if (hidden?.kind === "search") return { type: "redirect-search", q: hidden.q };
    return { type: "not-found" };
  }
  return { type: "render", seo };
}
