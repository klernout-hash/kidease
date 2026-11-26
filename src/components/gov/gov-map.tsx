import { useEffect, useMemo, useRef, useState } from "react";
import type { GovDashboard } from "@/lib/gov/aggregate";
import { dashboardView } from "@/lib/gov/aggregate";
import { govCopy } from "@/lib/gov/copy";
import { StoreMapFallback } from "@/components/store-map-fallback";
import { mapHostStyle } from "@/lib/osm-map";
import { useStoreChannel } from "@/lib/use-native-shell";

export function GovMap({ data }: { data: GovDashboard }) {
  const copy = govCopy(data.locale);
  const host = useRef<HTMLDivElement>(null);
  const channel = useStoreChannel();
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const view = dashboardView(data.province);
  // Rebuild only when the points really change. A fresh `data.map` array from a
  // loader revalidation used to tear the map down mid-load and start over, which
  // could leave "Loading the map." on screen indefinitely.
  const pointsKey = data.map.map((point) => `${point.lat},${point.lng},${point.centres}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => data.map.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)), [pointsKey]);

  useEffect(() => {
    const el = host.current;
    if (channel === "huawei" || !el || points.length === 0) return;
    setPhase("loading");
    let dead = false;
    let map: { destroy: () => void } | null = null;
    const circles: { setMap: (value: null) => void }[] = [];
    const ac = new AbortController();
    // Watchdog: once the map is on screen, give it 20 s, then show the failure
    // note with a Retry button instead of a loading line that never ends.
    let watchdog = 0;
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              if (!entries.some((entry) => entry.isIntersecting) || watchdog) return;
              watchdog = window.setTimeout(() => {
                if (!dead) {
                  ac.abort();
                  setPhase("failed");
                }
              }, 20000);
            },
            { rootMargin: "200px" },
          )
        : null;
    io?.observe(el);
    void (async () => {
      try {
        const { createKidEaseMap } = await import("@/lib/osm-map");
        const created = await createKidEaseMap(el, {
          center: { lat: view.lat, lng: view.lng },
          zoom: view.zoom,
          mapTypeId: "roadmap",
          cooperative: true,
          tileWaitMs: 8000,
          signal: ac.signal,
          provider: "openfreemap",
        });
        if (dead) {
          created.map.destroy();
          return;
        }
        map = created.map;
        const max = Math.max(...points.map((point) => point.centres), 1);
        for (const point of points) {
          circles.push(
            new created.maps.Circle({
              map: created.map,
              center: { lat: point.lat, lng: point.lng },
              radius: 8000 + (point.centres / max) * 24000,
              strokeColor: "#1A3790",
              strokeOpacity: 0.9,
              strokeWeight: 2,
              fillColor: "#1A3790",
              fillOpacity: 0.28,
            }),
          );
        }
        const bounds = new created.maps.LatLngBounds();
        for (const point of points) bounds.extend({ lat: point.lat, lng: point.lng });
        if (!bounds.isEmpty()) created.map.fitBounds(bounds, 48);
        created.map.resize();
        window.clearTimeout(watchdog);
        if (!dead) setPhase(created.tilesReady ? "ready" : "failed");
      } catch (err) {
        window.clearTimeout(watchdog);
        if (!dead && !ac.signal.aborted) {
          console.warn("[kidease-gov-map] map did not load", err instanceof Error ? err.message.slice(0, 120) : "");
        }
        if (!dead) setPhase("failed");
      }
    })();
    return () => {
      dead = true;
      io?.disconnect();
      window.clearTimeout(watchdog);
      ac.abort();
      for (const circle of circles) circle.setMap(null);
      map?.destroy();
    };
  }, [channel, points, view.lat, view.lng, view.zoom, attempt]);

  return (
    <section className="mt-8" aria-labelledby="gov-map-title">
      <h2 id="gov-map-title" className="font-display text-xl">
        {copy.map}
      </h2>
      <p className="mt-1 text-sm text-muted">{copy.mapNote}</p>
      {channel === "huawei" ? (
        <div className="mt-3">
          <StoreMapFallback />
        </div>
      ) : points.length === 0 ? (
        <p className="mt-3 text-sm text-muted" role="status" data-ke="gov-map-empty">{copy.mapEmpty}</p>
      ) : phase === "failed" ? (
        <div className="mt-3" data-ke="gov-map-failed">
          <p className="text-sm text-muted" role="alert">{copy.mapFailed}</p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-primary ring-1 ring-border touch-manipulation"
            onClick={() => {
              setPhase("loading");
              setAttempt((n) => n + 1);
            }}
          >
            {data.locale === "fr" ? "Réessayer" : "Try again"}
          </button>
        </div>
      ) : (
        <div
          className="relative mt-3 w-full overflow-hidden rounded-2xl bg-surface-2"
          style={{ height: "min(70dvh, 28rem)", minHeight: "16rem" }}
        >
          {phase === "loading" ? (
            <p className="absolute inset-x-0 top-3 z-10 px-3 text-center text-sm text-muted" role="status" data-ke="gov-map-loading">
              {copy.mapLoading}
            </p>
          ) : null}
          <div ref={host} style={mapHostStyle} role="img" aria-label={copy.map} />
        </div>
      )}
    </section>
  );
}
