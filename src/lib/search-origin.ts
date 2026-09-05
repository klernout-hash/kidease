import { canadaOriginOrWinnipeg, isInCanada } from "@/lib/canada-origin";
import { geocode, reverseGeocode, WINNIPEG } from "@/lib/geo";
import { getDeviceLocation } from "@/lib/native";
import { useAppStore } from "@/lib/store";
import { resolveLocationQuery } from "@/components/place-search";

/** Empty /search lands on the parent if we have a Canadian fix, otherwise Winnipeg. */
export async function bootSearchOrigin(incomingQ?: string) {
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

  const here = canadaOriginOrWinnipeg(useAppStore.getState().origin);
  setOrigin(here);
  setQuery(here.label);

  if (useAppStore.getState().locationConsent !== "granted") return;
  const pos = await getDeviceLocation({ precise: true });
  if (!pos || !isInCanada(pos.lat, pos.lng)) {
    if (!isInCanada(here.lat, here.lng)) {
      setOrigin(WINNIPEG);
      setQuery(WINNIPEG.label);
    }
    return;
  }
  const label = reverseGeocode(pos.lat, pos.lng);
  setOrigin({ lat: pos.lat, lng: pos.lng, label }, "gps");
  setQuery(label);
}
