/**
 * FEATURE_SPONSORED_LISTINGS — paid promotion (subscription add-on) is not live yet.
 * Default OFF: no public page shows "Sponsored" / "Commandité".
 * Turn on later with VITE_FEATURE_SPONSORED_LISTINGS=true at build time.
 */
export function sponsoredListingsEnabled(value?: string): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

/**
 * Paid pins sort first only when the same build flag that shows the Sponsored
 * label is on. Default off. This is not a subscription switch and this helper
 * does not turn it on.
 */
export function sponsoredPinsFirst(env?: Record<string, string | undefined>): boolean {
  const source = env ?? (typeof process !== "undefined" && process.env ? process.env : {});
  return sponsoredListingsEnabled(source.VITE_FEATURE_SPONSORED_LISTINGS);
}

export const FEATURE_SPONSORED_LISTINGS = sponsoredListingsEnabled(
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FEATURE_SPONSORED_LISTINGS,
);
