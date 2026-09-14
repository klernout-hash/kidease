import { resolveLocationQuery } from "@/components/place-search";
import {
  isUntrustedTorontoOrigin,
  localeSuggestsManitoba,
  readClientTimeZone,
  resolveDefaultSearchOrigin,
  shouldRequestExploreGeolocation,
  trustedSavedOrigin,
  type SearchOrigin,
} from "@/lib/default-origin";
import { clearSavedOrigin, geocode, readSavedOrigin, reverseGeocode } from "@/lib/geo";
import { getDeviceLocation } from "@/lib/native";
import { useAppStore } from "@/lib/store";

export {
  originFromSearchQuery,
  originsMatchSearchQuery,
  searchQueryFromUnknown,
  urlHasGeocodableSearchQuery,
} from "@/lib/search-query";

function applyTrustedSaved(timeZone: string | null) {
  const raw = readSavedOrigin();
  const trusted = trustedSavedOrigin(raw, { timeZone });
  if (raw && !trusted) clearSavedOrigin();
  return trusted;
}

/** Empty /search: street GPS, else saved / SSR IP, else Winnipeg. Typed q stays multi-city. */
export async function bootSearchOrigin(incomingQ?: string, ssrOrigin?: SearchOrigin | null) {
  const setOrigin = useAppStore.getState().setOrigin;
  const setQuery = useAppStore.getState().setQuery;
  const setLocationConsent = useAppStore.getState().setLocationConsent;
  const timeZone = readClientTimeZone();

  if (incomingQ) {
    setQuery(incomingQ);
    const local = geocode(incomingQ);
    if (local) {
      setOrigin({ ...local, explicit: true }, "manual");
      return;
    }
    const hit = await resolveLocationQuery(incomingQ);
    if (hit) setOrigin({ ...hit, explicit: true }, "manual");
    return;
  }

  const saved = applyTrustedSaved(timeZone);
  const consent = useAppStore.getState().locationConsent;
  const askGps = shouldRequestExploreGeolocation({
    consent,
    savedTrusted: Boolean(saved),
  });
  const pos = askGps ? await getDeviceLocation({ precise: true }) : null;
  if (pos && consent !== "granted") setLocationConsent("granted");
  const gpsAllowed = Boolean(pos) || consent === "granted";
  const fallback =
    ssrOrigin &&
    !isUntrustedTorontoOrigin(ssrOrigin) &&
    !(localeSuggestsManitoba({ timeZone }) && isUntrustedTorontoOrigin(ssrOrigin))
      ? ssrOrigin
      : null;
  const resolved = resolveDefaultSearchOrigin({
    saved,
    gps: pos,
    gpsAllowed,
    fallback,
    timeZone,
  });
  const label =
    resolved.source === "gps" && pos ? reverseGeocode(pos.lat, pos.lng) : resolved.label;
  setOrigin(
    {
      lat: resolved.lat,
      lng: resolved.lng,
      label,
      explicit: resolved.source === "gps" || resolved.source === "manual",
    },
    resolved.source,
  );
  setQuery(label);
}
