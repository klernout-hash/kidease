/**
 * FEATURE_SPONSORED_LISTINGS — paid promotion (subscription add-on) is not live yet.
 * Default OFF: no public page shows "Sponsored" / "Commandité".
 * Turn on later with VITE_FEATURE_SPONSORED_LISTINGS=true at build time.
 */
export function sponsoredListingsEnabled(value?: string): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export const FEATURE_SPONSORED_LISTINGS = sponsoredListingsEnabled(
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FEATURE_SPONSORED_LISTINGS,
);
