import { useEffect, useRef, useState } from "react";
import { createKidEaseMap, mapHostStyle, osmMaps, type OsmCircle, type OsmMap } from "@/lib/osm-map";
import { useStoreChannel } from "@/lib/use-native-shell";

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
  const channel = useStoreChannel();
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && radiusM >= 1500;
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (channel === "huawei" || !el || !valid) return;
    let cancelled = false;
    let circle: OsmCircle | null = null;
    let map: OsmMap | null = null;
    void (async () => {
      try {
        const created = await createKidEaseMap(el, {
          center: { lat, lng },
          zoom: 12,
          mapTypeId: "roadmap",
          cooperative: true,
        });
        if (cancelled) {
          created.map.destroy();
          return;
        }
        map = created.map;
        circle = new osmMaps.Circle({
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
        if (!bounds.isEmpty()) created.map.fitBounds(bounds, 24);
        setLive(true);
      } catch {
        if (!cancelled) setLive(false);
      }
    })();
    return () => {
      cancelled = true;
      circle?.setMap(null);
      map?.destroy();
    };
  }, [channel, lat, lng, radiusM, valid]);

  if (!valid) return null;

  return (
    <figure className="w-full min-w-0">
      <div
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#F7F4EF]"
        role="img"
        aria-label={label}
        data-ke={channel === "huawei" ? "map-fallback" : undefined}
      >
        <div className="grid h-full place-items-center">
          <div className="size-[min(68%,16rem)] rounded-full border-2 border-primary/80 bg-primary/10" />
          <p className="absolute max-w-[90%] px-4 text-center text-sm font-medium text-fg">{caption}</p>
        </div>
        <div
          ref={host}
          className={`ke-map-host !absolute inset-0 !h-full !w-full ${live ? "" : "invisible"}`}
          style={mapHostStyle}
        />
      </div>
    </figure>
  );
}
