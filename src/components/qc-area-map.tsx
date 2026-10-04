import { useEffect, useRef, useState } from "react";
import { createKidEaseMap, hasGoogleMapsBrowserKey, loadGoogleMaps } from "@/lib/google-maps";

type Props = {
  lat: number;
  lng: number;
  radiusM: number;
  label: string;
  caption: string;
};

/** Municipality circle only. Never draws a pin. */
export function QcAreaMap({ lat, lng, radiusM, label, caption }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && radiusM >= 1500;
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !valid || !hasGoogleMapsBrowserKey()) return;
    let cancelled = false;
    let circle: google.maps.Circle | null = null;
    void (async () => {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !el) return;
        const created = await createKidEaseMap(maps, el, {
          center: { lat, lng },
          zoom: 12,
          mapTypeId: "roadmap",
        });
        if (cancelled) return;
        created.map.setOptions({ gestureHandling: "cooperative" });
        circle = new maps.Circle({
          map: created.map,
          center: { lat, lng },
          radius: radiusM,
          strokeColor: "#1A3790",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#1A3790",
          fillOpacity: 0.16,
          clickable: false,
        });
        const bounds = circle.getBounds();
        if (bounds) created.map.fitBounds(bounds);
        setLive(true);
      } catch {
        if (!cancelled) setLive(false);
      }
    })();
    return () => {
      cancelled = true;
      circle?.setMap(null);
    };
  }, [lat, lng, radiusM, valid]);

  if (!valid) return null;

  return (
    <figure className="w-full min-w-0">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#F7F4EF]" role="img" aria-label={label}>
        <div className="grid h-full place-items-center">
          <div className="size-[min(68%,16rem)] rounded-full border-2 border-primary/80 bg-primary/10" />
          <p className="absolute max-w-[90%] px-4 text-center text-sm font-medium text-fg">{caption}</p>
        </div>
        <div ref={host} className={`ke-map-host absolute inset-0 ${live ? "" : "invisible"}`} />
      </div>
    </figure>
  );
}
