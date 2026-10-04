export type GoogleBits = {
  googlePlaceId?: string | null;
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  lat: number;
  lng: number;
};

export function googleMapsListingUrl(d: GoogleBits) {
  if (d.googlePlaceId) return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(d.googlePlaceId)}`;
  const q = `${d.name}, ${d.address}, ${d.city}, ${d.province} ${d.postalCode}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function googleReviewsUrl(d: GoogleBits) {
  if (d.googlePlaceId) return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(d.googlePlaceId)}`;
  return googleMapsListingUrl(d);
}

/** Only real Google ratings. Do not invent stars from a listing id. */
export function catalogGoogleRating(_id: string): { ratingX10: number; reviewCount: number } | null {
  return null;
}

/**
 * Google stars only when the Google columns are filled.
 * `rating_x10` defaults to 45 and is not a Google rating.
 * Parent verified-enrolment reviews win once there are enough of them.
 */
export function publicGoogleRating(item: {
  googleRatingX10?: number | null;
  googleReviewCount?: number | null;
  parentReviewCount?: number | null;
  parentRatingX10?: number | null;
  minParentReviews?: number;
}): { ratingX10: number; reviewCount: number } | null {
  const minParent = item.minParentReviews ?? 3;
  const parentCount = Math.max(0, Math.floor(item.parentReviewCount ?? 0));
  const parentRating = item.parentRatingX10 ?? 0;
  if (parentCount >= minParent && parentRating > 0) return null;
  const ratingX10 = Math.round(Number(item.googleRatingX10) || 0);
  const reviewCount = Math.max(0, Math.floor(Number(item.googleReviewCount) || 0));
  if (ratingX10 <= 0 || reviewCount <= 0) return null;
  return { ratingX10, reviewCount };
}
