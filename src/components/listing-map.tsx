import { useEffect, useRef, useState } from "react";
import {
  createListingOverlayFactory,
  googleMapsMapId,
  hasGoogleMapsBrowserKey,
  listingMapConstructorOptions,
  loadAdvancedMarkerElement,
  loadGoogleMaps,
} from "@/lib/google-maps";

/** Same smiling teardrop as search MapView. */
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <path fill="#ffffff" d="M50 3c22 0 40 17.4 40 39.2 0 16-10 29.4-25.2 42.2L50 99 35.2 84.4C20 71.6 10 58.2 10 42.2 10 20.4 28 3 50 3z"/>
  <path fill="#1A3790" d="M50 6c20.4 0 37 16.2 37 36.2 0 14.6-9.2 27.4-23.4 39.2L50 96 36.4 81.4C22.2 69.6 13 56.8 13 42.2 13 22.2 29.6 6 50 6z"/>
  <circle cx="50" cy="42" r="22" fill="#fff"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M39 40c2.2-4 6.2-4 8.4 0"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M52.6 40c2.2-4 6.2-4 8.4 0"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M41 51c5.4 7 12.6 7 18 0"/>
</svg>`;

type Props = {
  lat: number;
  lng: number;
  title: string;
};

/** Listing preview: same Maps JavaScript API and browser key as search. */
export function ListingMap({ lat, lng, title }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const valid = Number.isFinite(lat) && Number.isFinite(lng);
  const [failed, setFailed] = useState(!hasGoogleMapsBrowserKey() || !valid);

  useEffect(() => {
    const el = host.current;
    if (!el || !hasGoogleMapsBrowserKey() || !valid) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let pin: { setMap(map: google.maps.Map | null): void } | null = null;

    void (async () => {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !el) return;
        el.innerHTML = "";
        const center = { lat, lng };
        const map = new maps.Map(
          el,
          listingMapConstructorOptions({
            maps,
            center,
            zoom: 16,
            mapTypeId: "roadmap",
            mapId: googleMapsMapId(),
          }),
        );
        map.setOptions({ gestureHandling: "cooperative" });
        const AdvancedMarker = await loadAdvancedMarkerElement(maps);
        const factory = createListingOverlayFactory(maps, AdvancedMarker);
        const content = document.createElement("div");
        content.className = "ke-logo-pin";
        content.innerHTML = PIN_SVG;
        pin = factory({ map, position: center, content });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      pin?.setMap(null);
    };
  }, [lat, lng, valid]);

  if (failed) {
    return <div className="h-64 bg-map md:h-80" role="img" aria-label={title} />;
  }

  return <div ref={host} className="h-64 w-full bg-map md:h-80" role="img" aria-label={title} />;
}
