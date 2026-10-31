import { useEffect, useRef, useState } from "react";
import type { GovDashboard } from "@/lib/gov/aggregate";
import { dashboardView } from "@/lib/gov/aggregate";
import { govCopy } from "@/lib/gov/copy";

export function GovMap({ data }: { data: GovDashboard }) {
  const copy = govCopy(data.locale);
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const view = dashboardView(data.province);
  const points = data.map;

  useEffect(() => {
    const el = host.current;
    if (!el || points.length === 0) return;
    let dead = false;
    let map: { destroy: () => void } | null = null;
    const circles: { setMap: (value: null) => void }[] = [];
    void (async () => {
      try {
        const { createKidEaseMap, OsmCircle } = await import("@/lib/osm-map");
        const created = await createKidEaseMap(el, {
          center: { lat: view.lat, lng: view.lng },
          zoom: view.zoom,
          mapTypeId: "roadmap",
          cooperative: true,
          tileWaitMs: 8000,
        });
        if (dead) {
          created.map.destroy();
          return;
        }
        map = created.map;
        const max = Math.max(...points.map((point) => point.centres), 1);
        for (const point of points) {
          const desert = point.desert != null;
          circles.push(
            new OsmCircle({
              map: created.map,
              center: { lat: point.lat, lng: point.lng },
              radius: 8000 + (point.centres / max) * 24000,
              strokeColor: desert ? "#9a3412" : "#1A3790",
              strokeOpacity: 0.9,
              strokeWeight: 2,
              fillColor: desert ? "#c2410c" : "#1A3790",
              fillOpacity: 0.28,
            }),
          );
        }
        if (!created.tilesReady) setFailed(true);
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => {
      dead = true;
      for (const circle of circles) circle.setMap(null);
      map?.destroy();
    };
  }, [points, view.lat, view.lng, view.zoom]);

  return (
    <section className="mt-8" aria-labelledby="gov-map-title">
      <h2 id="gov-map-title" className="font-display text-xl">
        {copy.map}
      </h2>
      <p className="mt-1 text-sm text-muted">{copy.mapNote}</p>
      {failed ? <p className="mt-3 text-sm">{copy.mapNote}</p> : null}
      <div
        ref={host}
        className="mt-3 h-[min(70dvh,28rem)] w-full overflow-hidden rounded-2xl bg-surface-2"
        role="img"
        aria-label={copy.map}
      />
    </section>
  );
}
