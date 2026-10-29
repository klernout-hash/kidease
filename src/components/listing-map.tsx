import { useEffect, useRef, useState } from "react";
import { createKidEaseMap, createListingOverlay } from "@/lib/osm-map";
import { useCopy } from "@/lib/use-copy";
import { useStoreChannel } from "@/lib/use-native-shell";
import { MapUnavailable } from "@/components/map-unavailable";
import { StoreMapFallback } from "@/components/store-map-fallback";

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
  address?: string;
};

/** Listing preview. OpenStreetMap tiles, loaded when the page opens. */
export function ListingMap(props: Props) {
  const channel = useStoreChannel();
  if (channel === "huawei") return <StoreMapFallback compact />;
  return <OsmListingMap {...props} />;
}

function OsmListingMap({ lat, lng, title, address }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const valid = Number.isFinite(lat) && Number.isFinite(lng);
  const { t } = useCopy();
  const [failed, setFailed] = useState(!valid);
  const [basemapReady, setBasemapReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !valid) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let pin: { setMap(map: null): void } | null = null;
    let map: { destroy(): void } | null = null;

    void (async () => {
      try {
        el.replaceChildren();
        const center = { lat, lng };
        const created = await createKidEaseMap(el, {
          center,
          zoom: 16,
          mapTypeId: "roadmap",
          cooperative: true,
        });
        if (cancelled) {
          created.map.destroy();
          return;
        }
        map = created.map;
        const content = document.createElement("div");
        content.className = "ke-logo-pin";
        content.innerHTML = PIN_SVG;
        pin = createListingOverlay({ map: created.map, position: center, content });
        setBasemapReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      setBasemapReady(false);
      pin?.setMap(null);
      map?.destroy();
    };
  }, [lat, lng, valid]);

  if (failed) {
    return <MapUnavailable compact address={address || title} lat={lat} lng={lng} />;
  }

  return (
    <div className="relative h-40 w-full overflow-hidden bg-map md:h-48" role="img" aria-label={title}>
      <div ref={host} className="ke-map-host absolute inset-0" />
      {basemapReady ? null : (
        <div className="ke-map-skel pointer-events-none absolute inset-0 grid place-items-center px-6 text-center" role="status">
          <p className="text-sm font-medium text-muted">{t("mapLoading")}</p>
        </div>
      )}
    </div>
  );
}
