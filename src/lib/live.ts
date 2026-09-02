/** True only when the centre has claimed and can take requests on KidEase. */
export const MIN_LIVE_RATING = 3.5;
export const MIN_RATING_REVIEWS = 3;

export function meetsRatingFloor(ratingX10 = 0, reviewCount = 0) {
  if (!reviewCount || reviewCount < MIN_RATING_REVIEWS) return true;
  return ratingX10 >= MIN_LIVE_RATING * 10;
}

export function canAppearOnPlatform(d: {
  listingActive?: boolean | null;
  ratingX10?: number;
  reviewCount?: number;
}) {
  if (d.listingActive === false) return false;
  return meetsRatingFloor(d.ratingX10 ?? 0, d.reviewCount ?? 0);
}

export function isPlatformLive(
  _id: string,
  claimed = false,
  extra?: { listingActive?: boolean | null; ratingX10?: number; reviewCount?: number },
) {
  if (!claimed) return false;
  if (extra && extra.listingActive === false) return false;
  if (extra && !meetsRatingFloor(extra.ratingX10 ?? 0, extra.reviewCount ?? 0)) return false;
  return true;
}
