import { useEffect, useRef, useState } from "react";
import {
  createKidEaseMap,
  createListingOverlayFactory,
  hasGoogleMapsBrowserKey,
  loadAdvancedMarkerElement,
  loadGoogleMaps,
} from "@/lib/google-maps";
import { useCopy } from "@/lib/use-copy";

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
  const { t } = useCopy();
  const [failed, setFailed] = useState(!hasGoogleMapsBrowserKey() || !valid);
  const [basemapReady, setBasemapReady] = useState(false);

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
        const created = await createKidEaseMap(maps, el, {
          center,
          zoom: 16,
          mapTypeId: "roadmap",
        });
        if (cancelled) return;
        created.map.setOptions({ gestureHandling: "cooperative" });
        const AdvancedMarker = await loadAdvancedMarkerElement(maps, created.usedMapId);
        const factory = createListingOverlayFactory(maps, AdvancedMarker);
        const content = document.createElement("div");
        content.className = "ke-logo-pin";
        content.innerHTML = PIN_SVG;
        pin = factory({ map: created.map, position: center, content });
        setBasemapReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      setBasemapReady(false);
      pin?.setMap(null);
    };
  }, [lat, lng, valid]);

  if (failed) {
    return <div className="h-64 bg-map md:h-80" role="img" aria-label={title} />;
  }

  return (
    <div className="relative h-64 w-full overflow-hidden bg-map md:h-80" role="img" aria-label={title}>
      <div ref={host} className="ke-map-host absolute inset-0" />
      {basemapReady ? null : (
        <div className="ke-map-skel pointer-events-none absolute inset-0 grid place-items-center px-6 text-center" role="status">
          <p className="text-sm font-medium text-muted">{t("mapLoading")}</p>
        </div>
      )}
    </div>
  );
}
