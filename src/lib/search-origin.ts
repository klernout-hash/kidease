import { resolveLocationQuery } from "@/components/place-search";
import { resolveDefaultSearchOrigin, type SearchOrigin } from "@/lib/default-origin";
import { geocode, readSavedOrigin, reverseGeocode } from "@/lib/geo";
import { getDeviceLocation } from "@/lib/native";
import { useAppStore } from "@/lib/store";

/** Empty /search: precise Canada GPS, else saved / SSR IP, else Winnipeg. Typed q stays multi-city. */
export async function bootSearchOrigin(incomingQ?: string, ssrOrigin?: SearchOrigin | null) {
  const setOrigin = useAppStore.getState().setOrigin;
  const setQuery = useAppStore.getState().setQuery;

  if (incomingQ) {
    setQuery(incomingQ);
    const local = geocode(incomingQ);
    if (local) {
      setOrigin(local);
      return;
    }
    const hit = await resolveLocationQuery(incomingQ);
    if (hit) setOrigin(hit);
    return;
  }

  const consent = useAppStore.getState().locationConsent;
  const gpsAllowed = consent === "granted";
  const pos = gpsAllowed ? await getDeviceLocation({ precise: true }) : null;
  const resolved = resolveDefaultSearchOrigin({
    saved: readSavedOrigin(),
    gps: pos,
    gpsAllowed,
    fallback: ssrOrigin,
  });
  const label =
    resolved.source === "gps" && pos ? reverseGeocode(pos.lat, pos.lng) : resolved.label;
  setOrigin({ lat: resolved.lat, lng: resolved.lng, label }, resolved.source);
  setQuery(label);
}
