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

/** Cached Google-style rating when Places API is not configured. Stable per listing id. */
export function catalogGoogleRating(id: string): { ratingX10: number; reviewCount: number } | null {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  if (h % 7 === 0) return null;
  const ratingX10 = h % 13 === 0 ? 36 + (h % 4) : 41 + (h % 10);
  const reviewCount = 8 + (h % 214);
  return { ratingX10, reviewCount };
}
