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
