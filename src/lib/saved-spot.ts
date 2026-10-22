/**
 * When a saved centre's open-spot count goes up, parents who hearted it
 * can hear about it. Price changes use the saved-listing alert instead.
 * Pure: scripts/saved-spot.test.mjs loads this in Node.
 */

export type SpotCounts = {
  infant: number;
  toddler: number;
  preschool: number;
};

function total(spots: SpotCounts): number {
  return Math.max(0, Math.round(spots.infant) || 0) + Math.max(0, Math.round(spots.toddler) || 0) + Math.max(0, Math.round(spots.preschool) || 0);
}

/** True only when the centre added at least one open spot. A price-only edit is false. */
export function spotsOpened(before: SpotCounts, after: SpotCounts): boolean {
  return total(after) > total(before);
}
