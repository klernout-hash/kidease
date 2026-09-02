/** Live / search rules for a centre on KidEase. */
export const MIN_LIVE_RATING = 3.5;

/**
 * A listing stays on the site until a real star rating exists.
 * New centres have no history yet — do not hide them for a missing score.
 * The 3.5 floor only runs after reviewCount >= 1 and ratingX10 > 0.
 */
export function hasAssignedRating(ratingX10 = 0, reviewCount = 0) {
  return reviewCount >= 1 && ratingX10 > 0;
}

export function meetsRatingFloor(ratingX10 = 0, reviewCount = 0) {
  if (!hasAssignedRating(ratingX10, reviewCount)) return true;
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
