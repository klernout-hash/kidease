/**
 * A hidden possible-second-site row stays in daycares.
 * Its public URL 301s to the city hub, or to search for that city.
 * It does not 301 to the live sibling.
 */

import { cityHubDefForPlace } from "./city-hubs.ts";
import { isHiddenReviewFault } from "./listing-visibility.ts";

export type HiddenReviewRedirect =
  | { kind: "city"; city: string }
  | { kind: "search"; q: string };

export function hiddenReviewPlaceFromRow(row: {
  importFault?: string | null;
  mergedInto?: string | null;
  city?: string | null;
  province?: string | null;
} | null | undefined): { city: string; province: string } | null {
  if (!row) return null;
  if ((row.mergedInto || "").trim()) return null;
  if (!isHiddenReviewFault(row.importFault)) return null;
  return {
    city: (row.city || "").trim(),
    province: (row.province || "").trim(),
  };
}

/** Winnipeg goes to the city hub. A town without a hub goes to /search?q=. */
export function hiddenReviewRedirectTarget(
  city: string | null | undefined,
  province: string | null | undefined,
): HiddenReviewRedirect {
  const place = (city || "").trim();
  const hub = cityHubDefForPlace(place, province);
  if (hub) return { kind: "city", city: hub.slug };
  return { kind: "search", q: place };
}
