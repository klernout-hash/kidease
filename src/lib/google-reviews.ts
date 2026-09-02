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
