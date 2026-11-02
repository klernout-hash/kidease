/**
 * Browser Google Maps key.
 *
 * The host env may keep VITE_GOOGLE_MAPS_API_KEY for a later switch back.
 * Public JavaScript receives it only when FEATURE_GOOGLE_MAPS or
 * VITE_GOOGLE_MAPS is on at build time. Maps stay on OpenFreeMap until then.
 */

function flagOn(raw) {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export function googleMapsBrowserEnabled(env = {}) {
  return flagOn(env.FEATURE_GOOGLE_MAPS) || flagOn(env.VITE_GOOGLE_MAPS);
}

/** Empty string unless the build flag is on. Never logs the key. */
export function googleMapsBrowserKey(env = {}) {
  if (!googleMapsBrowserEnabled(env)) return "";
  return String(env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || "").trim();
}
