import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Navigation } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { DaycareCard } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { mapZoomForRadius, openDirections, readMapBase, writeMapBase, type MapBase } from "@/lib/maps";
import {
  defineHtmlOverlay,
  googleMapTypeId,
  GOOGLE_MAPS_BROWSER_ENV,
  hasGoogleMapsBrowserKey,
  loadGoogleMaps,
  type HtmlOverlayInstance,
} from "@/lib/google-maps";
import { GoogleRating } from "@/components/google-rating";
import { BuildingPhoto } from "@/components/building-photo";
import { PriorityPill } from "@/components/priority-pill";
import { feeBadgeKey, pinFeeLabel, licenseRecordUrl } from "@/lib/licensing";

type Props = {
  items: DaycareCard[];
  origin: { lat: number; lng: number };
  radiusKm: number;
  activeSlug?: string | null;
  onSelect: (slug: string) => void;
  onRelocate?: (pos: { lat: number; lng: number }) => void;
};

const ROAD_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export function MapView({ items, origin, radiusKm, activeSlug, onSelect, onRelocate }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapsApiRef = useRef<typeof google.maps | null>(null);
  const HtmlOverlayRef = useRef<ReturnType<typeof defineHtmlOverlay> | null>(null);
  const pinsRef = useRef<HtmlOverlayInstance[]>([]);
  const youRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const markersBySlug = useRef(new Map<string, HtmlOverlayInstance>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const locale = useAppStore((s) => s.locale);
  const { t } = useCopy();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(() =>
    hasGoogleMapsBrowserKey() ? null : `${GOOGLE_MAPS_BROWSER_ENV} is not set`,
  );
  const [zoom, setZoom] = useState(12);
  const [base, setBase] = useState<MapBase>("roadmap");
  const [picked, setPicked] = useState<string | null>(activeSlug ?? null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setBase(readMapBase());
  }, []);

  const selected = useMemo(
    () => items.find((i) => i.slug === (picked || activeSlug)) ?? null,
    [items, picked, activeSlug],
  );

  useEffect(() => {
    if (activeSlug) setPicked(activeSlug);
  }, [activeSlug]);

  useEffect(() => {
    const el = host.current;
    if (!el || !hasGoogleMapsBrowserKey()) return;
    let cancelled = false;
    let map: google.maps.Map | null = null;
    const markers = markersBySlug.current;

    void (async () => {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !el) return;
        el.innerHTML = "";
        map = new maps.Map(el, {
          center: { lat: origin.lat, lng: origin.lng },
          zoom: mapZoomForRadius(radiusKm),
          mapTypeId: googleMapTypeId(readMapBase()),
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          gestureHandling: "greedy",
          clickableIcons: false,
          styles: ROAD_STYLES,
        });
        map.addListener("zoom_changed", () => {
          const next = map?.getZoom();
          if (typeof next === "number") setZoom(next);
        });
        const startZoom = map.getZoom();
        if (typeof startZoom === "number") setZoom(startZoom);
        mapRef.current = map;
        mapsApiRef.current = maps;
        HtmlOverlayRef.current = defineHtmlOverlay(maps);
        setLoadError(null);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Google Maps failed to load");
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      if (map) {
        window.google?.maps?.event.clearInstanceListeners(map);
      }
      for (const pin of pinsRef.current) pin.setMap(null);
      pinsRef.current = [];
      youRef.current?.setMap(null);
      youRef.current = null;
      circleRef.current?.setMap(null);
      circleRef.current = null;
      markers.clear();
      mapRef.current = null;
      mapsApiRef.current = null;
      HtmlOverlayRef.current = null;
      el.innerHTML = "";
    };
    // Created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const el = host.current;
    if (!map || !el || !ready) return;
    const ro = new ResizeObserver(() => {
      window.google?.maps?.event.trigger(map, "resize");
    });
    ro.observe(el);
    window.google?.maps?.event.trigger(map, "resize");
    return () => ro.disconnect();
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setMapTypeId(googleMapTypeId(base));
    writeMapBase(base);
  }, [base, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !ready) return;
    map.panTo({ lat: origin.lat, lng: origin.lng });
    map.setZoom(mapZoomForRadius(radiusKm));
    if (circleRef.current) {
      circleRef.current.setCenter({ lat: origin.lat, lng: origin.lng });
      circleRef.current.setRadius(Math.max(radiusKm, 0.5) * 1000);
    } else {
      circleRef.current = new maps.Circle({
        map,
        center: { lat: origin.lat, lng: origin.lng },
        radius: Math.max(radiusKm, 0.5) * 1000,
        strokeColor: "#1a3790",
        strokeWeight: 1,
        fillColor: "#1a3790",
        fillOpacity: 0.08,
        clickable: false,
      });
    }
    if (youRef.current) {
      youRef.current.setPosition({ lat: origin.lat, lng: origin.lng });
    } else {
      youRef.current = new maps.Marker({
        map,
        position: { lat: origin.lat, lng: origin.lng },
        clickable: false,
        zIndex: 2,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#1a3790",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    }
  }, [origin.lat, origin.lng, radiusKm, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const HtmlOverlay = HtmlOverlayRef.current;
    if (!map || !HtmlOverlay || !ready) return;

    for (const pin of pinsRef.current) pin.setMap(null);
    pinsRef.current = [];
    markersBySlug.current.clear();

    const clusters = clusterItems(items, zoom);
    const nextPins: HtmlOverlayInstance[] = [];
    for (const node of clusters) {
      if (node.kind === "group") {
        const content = document.createElement("div");
        content.className = "ke-cluster";
        content.innerHTML = `<span>${node.count}</span>`;
        const overlay = new HtmlOverlay({
          map,
          position: { lat: node.lat, lng: node.lng },
          content,
          centered: true,
          zIndex: 100,
          onClick: () => {
            map.setZoom(Math.min(zoom + 2, 16));
            map.panTo({ lat: node.lat, lng: node.lng });
          },
        });
        nextPins.push(overlay);
        continue;
      }
      const item = node.item;
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
      const live = Boolean(item.live);
      const content = document.createElement("div");
      content.className = `dn-pin${live ? " is-live" : " is-unclaimed"}`;
      content.innerHTML = live
        ? `<span class="ke-pin-check">✓</span><span>${pinFeeLabel(item.province, true, item.fromPrice, locale, money)}</span>`
        : `<span>${pinFeeLabel(item.province, false, item.fromPrice, locale, money)}</span>`;
      const overlay = new HtmlOverlay({
        map,
        position: { lat: item.lat, lng: item.lng },
        content,
        onClick: () => {
          setPicked(item.slug);
          onSelectRef.current(item.slug);
        },
      });
      nextPins.push(overlay);
      markersBySlug.current.set(item.slug, overlay);
    }
    pinsRef.current = nextPins;
  }, [items, locale, ready, zoom]);

  useEffect(() => {
    const slug = picked || activeSlug;
    for (const [id, marker] of markersBySlug.current) {
      const el = marker.getElement();
      el.classList.toggle("is-active", id === slug);
      marker.setZIndex(id === slug ? 500 : 0);
    }
  }, [picked, activeSlug, zoom, items]);

  async function locateMe() {
    setLocating(true);
    const pos = await getDeviceLocation();
    setLocating(false);
    if (!pos) return;
    mapRef.current?.panTo({ lat: pos.lat, lng: pos.lng });
    mapRef.current?.setZoom(13);
    void hapticLight();
    onRelocate?.(pos);
  }

  return (
    <div className="relative size-full min-h-[280px] overflow-hidden rounded-lg bg-map">
      <div ref={host} className="absolute inset-0" />

      {loadError ? (
        <div className="absolute inset-0 z-[300] grid place-items-center bg-map px-6 text-center">
          <p className="max-w-sm text-sm text-muted">
            Map is unavailable. Set <span className="font-mono text-fg">{GOOGLE_MAPS_BROWSER_ENV}</span> so the
            browser can load Google Maps.
          </p>
        </div>
      ) : null}

      <div className="absolute right-3 top-3 z-[400] flex flex-col gap-2">
        <div className="overflow-hidden rounded-full bg-surface text-xs font-medium shadow-card ring-1 ring-border">
          <button
            type="button"
            className={cn("px-3 py-1.5", base === "roadmap" ? "bg-primary text-primary-fg" : "text-muted")}
            onClick={() => setBase("roadmap")}
          >
            {t("mapRoad")}
          </button>
          <button
            type="button"
            className={cn("px-3 py-1.5", base === "satellite" ? "bg-primary text-primary-fg" : "text-muted")}
            onClick={() => setBase("satellite")}
          >
            {t("mapSat")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void locateMe()}
          disabled={locating}
          className="grid size-10 place-items-center rounded-full bg-surface text-primary shadow-card ring-1 ring-border"
          aria-label={t("useLocation")}
        >
          <LocateFixed className={cn("size-5", locating && "animate-pulse")} />
        </button>
      </div>

      {selected ? (
        <div className="absolute inset-x-3 bottom-3 z-[400] overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
          {selected.live ? <span className="block h-1 bg-primary" /> : null}
          <div className="flex gap-3 p-3">
            {selected.photos.find((p) => !p.includes("-logo")) ? (
              <BuildingPhoto
                src={selected.photos.find((p) => !p.includes("-logo")) ?? ""}
                className="size-16 shrink-0 rounded-md object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link to="/daycare/$slug" params={{ slug: selected.slug }} className="block truncate text-[15px] font-semibold tracking-[-0.015em] hover:underline">
                  {locale === "fr" ? selected.nameFr : selected.name}
                </Link>
                {selected.priority ? <PriorityPill /> : null}
                <span
                  className={
                    selected.live
                      ? "shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-fg"
                      : "shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted"
                  }
                >
                  {selected.live ? t("live") : t("notOnKidEase")}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {selected.distanceKm} {t("km")}
                {" · "}
                {selected.live || selected.availabilityKnown
                  ? selected.spotsTotal > 0
                    ? `${selected.spotsTotal} ${t("spots")}`
                    : t("waitlist")
                  : t("availUnknown")}
              </p>
              <p className="mt-1">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {t(feeBadgeKey(selected.province))}
                </span>
              </p>
              <div className="mt-1">
                <GoogleRating item={selected} ratingX10={selected.ratingX10} reviewCount={selected.reviewCount} compact />
              </div>
              {selected.live && selected.fromPrice > 0 ? (
                <p className="mt-0.5 text-sm tabular-nums">
                  {t("monthlyFrom")} {money(selected.fromPrice, locale)}
                  {t("month")}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted">{t("feeUnknown")}</p>
              )}
              <a
                href={licenseRecordUrl(selected.province, selected.name, selected.licenseNumber)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
              >
                {t("viewLicenceShort")}
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-fg"
              onClick={() => void openDirections(selected.lat, selected.lng, selected.name)}
            >
              <Navigation className="size-4" />
              {t("directions")}
            </button>
            <Link
              to="/daycare/$slug"
              params={{ slug: selected.slug }}
              className="inline-flex h-10 items-center justify-center rounded-md bg-surface-2 text-sm font-medium"
            >
              {selected.live ? t("book") : t("viewListing")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ClusterNode =
  | { kind: "pin"; item: DaycareCard }
  | { kind: "group"; lat: number; lng: number; count: number };

function clusterItems(items: DaycareCard[], zoom: number): ClusterNode[] {
  if (zoom >= 13 || items.length < 18) return items.map((item) => ({ kind: "pin", item }));
  const cell = zoom >= 11 ? 0.045 : zoom >= 9 ? 0.09 : 0.18;
  const buckets = new Map<string, DaycareCard[]>();
  for (const item of items) {
    const key = `${Math.round(item.lat / cell)}_${Math.round(item.lng / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  const out: ClusterNode[] = [];
  for (const list of buckets.values()) {
    if (list.length === 1) {
      out.push({ kind: "pin", item: list[0] });
      continue;
    }
    const lat = list.reduce((s, i) => s + i.lat, 0) / list.length;
    const lng = list.reduce((s, i) => s + i.lng, 0) / list.length;
    out.push({ kind: "group", lat, lng, count: list.length });
  }
  return out;
}
