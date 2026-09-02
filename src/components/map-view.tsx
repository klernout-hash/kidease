import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Minus, Navigation, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { DaycareCard } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { mapZoomForRadius, openDirections, readMapBase, writeMapBase, type MapBase } from "@/lib/maps";
import {
  createListingOverlayFactory,
  createYouAreHereDot,
  googleMapTypeId,
  googleMapsMapId,
  GOOGLE_MAPS_BROWSER_ENV,
  hasGoogleMapsBrowserKey,
  listingMapConstructorOptions,
  loadAdvancedMarkerElement,
  loadGoogleMaps,
  type AdvancedMarkerCtor,
  type ListingOverlay,
  type MovableDot,
} from "@/lib/google-maps";
import { GoogleRating } from "@/components/google-rating";
import { BuildingPhoto } from "@/components/building-photo";
import { PriorityPill } from "@/components/priority-pill";
import { feeBadgeKey, licenseRecordUrl } from "@/lib/licensing";
import { displayDistance } from "@/lib/units";

type Props = {
  items: DaycareCard[];
  origin: { lat: number; lng: number };
  radiusKm: number;
  activeSlug?: string | null;
  onSelect: (slug: string) => void;
  onRelocate?: (pos: { lat: number; lng: number }) => void;
  onLocate?: () => void;
};

/** Brand map pin — same smiling teardrop as the KidEase logo. */
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <path fill="#ffffff" d="M50 3c22 0 40 17.4 40 39.2 0 16-10 29.4-25.2 42.2L50 99 35.2 84.4C20 71.6 10 58.2 10 42.2 10 20.4 28 3 50 3z"/>
  <path fill="#1A3790" d="M50 6c20.4 0 37 16.2 37 36.2 0 14.6-9.2 27.4-23.4 39.2L50 96 36.4 81.4C22.2 69.6 13 56.8 13 42.2 13 22.2 29.6 6 50 6z"/>
  <circle cx="50" cy="42" r="22" fill="#fff"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M39 40c2.2-4 6.2-4 8.4 0"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M52.6 40c2.2-4 6.2-4 8.4 0"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M41 51c5.4 7 12.6 7 18 0"/>
</svg>`;

const PIN_DATA_URL = "/favicon.svg";

type AnyPin = {
  setMap(map: google.maps.Map | null): void;
};

type SlugPin = AnyPin & {
  setActive(on: boolean, maps: typeof google.maps): void;
};

const MAP_PAD = { top: 88, right: 20, bottom: 240, left: 20 };

export function MapView({ items, origin, radiusKm, activeSlug, onSelect, onRelocate, onLocate }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapsApiRef = useRef<typeof google.maps | null>(null);
  const overlayFactoryRef = useRef<ReturnType<typeof createListingOverlayFactory> | null>(null);
  const advancedMarkerRef = useRef<AdvancedMarkerCtor | null>(null);
  const pinsRef = useRef<AnyPin[]>([]);
  const youRef = useRef<MovableDot | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const markersBySlug = useRef(new Map<string, SlugPin>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const locale = useAppStore((s) => s.locale);
  const distanceUnit = useAppStore((s) => s.distanceUnit);
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
        const mapId = googleMapsMapId();
        map = new maps.Map(
          el,
          listingMapConstructorOptions({
            maps,
            center: { lat: origin.lat, lng: origin.lng },
            zoom: mapZoomForRadius(radiusKm),
            mapTypeId: googleMapTypeId(readMapBase()),
            mapId,
          }),
        );
        map.addListener("zoom_changed", () => {
          const next = map?.getZoom();
          if (typeof next === "number") setZoom(next);
        });
        const startZoom = map.getZoom();
        if (typeof startZoom === "number") setZoom(startZoom);
        const AdvancedMarker = await loadAdvancedMarkerElement(maps, mapId);
        if (cancelled) return;
        mapRef.current = map;
        mapsApiRef.current = maps;
        advancedMarkerRef.current = AdvancedMarker;
        overlayFactoryRef.current = createListingOverlayFactory(maps, AdvancedMarker);
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
      overlayFactoryRef.current = null;
      advancedMarkerRef.current = null;
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
        fillOpacity: 0.06,
        clickable: false,
      });
    }
    const bounds = circleRef.current.getBounds();
    if (bounds) {
      map.fitBounds(bounds, MAP_PAD);
    } else {
      map.setZoom(mapZoomForRadius(radiusKm));
    }
    if (youRef.current) {
      youRef.current.setPosition({ lat: origin.lat, lng: origin.lng });
    } else {
      youRef.current = createYouAreHereDot({
        maps,
        map,
        position: { lat: origin.lat, lng: origin.lng },
        AdvancedMarker: advancedMarkerRef.current,
      });
    }
  }, [origin.lat, origin.lng, radiusKm, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    const createOverlay = overlayFactoryRef.current;
    if (!map || !maps || !createOverlay || !ready) return;

    const timer = window.setTimeout(() => {
      for (const pin of pinsRef.current) pin.setMap(null);
      pinsRef.current = [];
      markersBySlug.current.clear();

      const clusters = clusterItems(items, zoom);
      const nextPins: AnyPin[] = [];
      const useAdvanced = Boolean(advancedMarkerRef.current);
      for (const node of clusters) {
        if (node.kind === "group") {
          const content = clusterEl(node.count);
          const overlay = createOverlay({
            map,
            position: { lat: node.lat, lng: node.lng },
            content,
            centered: true,
            zIndex: 40 + Math.min(node.count, 200),
            collision: "REQUIRED",
            onClick: () => {
              const box = new maps.LatLngBounds();
              for (const item of node.items) {
                if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
                  box.extend({ lat: item.lat, lng: item.lng });
                }
              }
              if (!box.isEmpty()) {
                map.fitBounds(box, MAP_PAD);
              } else {
                map.setZoom(Math.min(zoom + 2, 16));
                map.panTo({ lat: node.lat, lng: node.lng });
              }
            },
          });
          nextPins.push(overlay);
          continue;
        }
        const item = node.item;
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
        if (useAdvanced) {
          const content = logoPinEl("ke-logo-pin");
          content.setAttribute("aria-label", item.name);
          const overlay = createOverlay({
            map,
            position: { lat: item.lat, lng: item.lng },
            content,
            zIndex: item.live ? 20 : 10,
            collision: "OPTIONAL_AND_HIDES_LOWER_PRIORITY",
            onClick: () => {
              setPicked(item.slug);
              onSelectRef.current(item.slug);
            },
          });
          nextPins.push(overlay);
          markersBySlug.current.set(item.slug, wrapOverlayPin(overlay));
          continue;
        }
        const marker = new maps.Marker({
          map,
          position: { lat: item.lat, lng: item.lng },
          icon: pinIcon(maps, 36),
          title: item.name,
          optimized: false,
          zIndex: item.live ? 20 : 10,
        });
        marker.addListener("click", () => {
          setPicked(item.slug);
          onSelectRef.current(item.slug);
        });
        nextPins.push(marker);
        markersBySlug.current.set(item.slug, wrapClassicPin(marker));
      }
      pinsRef.current = nextPins;
    }, 50);

    return () => window.clearTimeout(timer);
  }, [items, locale, ready, zoom]);

  useEffect(() => {
    const maps = mapsApiRef.current;
    if (!maps) return;
    const slug = picked || activeSlug;
    for (const [id, pin] of markersBySlug.current) {
      pin.setActive(id === slug, maps);
    }
  }, [picked, activeSlug, zoom, items]);

  async function locateMe() {
    if (onLocate) {
      onLocate();
      return;
    }
    setLocating(true);
    const pos = await getDeviceLocation({ precise: true });
    setLocating(false);
    if (!pos) return;
    mapRef.current?.panTo({ lat: pos.lat, lng: pos.lng });
    mapRef.current?.setZoom(13);
    void hapticLight();
    onRelocate?.(pos);
  }

  function bumpZoom(delta: number) {
    const map = mapRef.current;
    if (!map) return;
    const next = Math.min(18, Math.max(4, (map.getZoom() ?? zoom) + delta));
    map.setZoom(next);
  }

  return (
    <div className="relative size-full min-h-[280px] overflow-hidden rounded-lg bg-map">
      <div ref={host} className="absolute inset-0" />

      {loadError ? (
        <div className="absolute inset-0 z-[300] grid place-items-center bg-map px-6 text-center">
          <p className="max-w-sm text-sm text-muted">
            Map is temporarily unavailable. Licensed daycares are still listed on this page.
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] h-16 bg-gradient-to-b from-bg/55 to-transparent lg:h-8" />

      <div className="ke-map-controls absolute right-3 top-[4.6rem] z-[400] flex flex-col items-end gap-2 lg:top-3">
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
        <div className="overflow-hidden rounded-full bg-surface shadow-card ring-1 ring-border">
          <button
            type="button"
            onClick={() => bumpZoom(1)}
            className="grid size-10 place-items-center text-fg hover:bg-surface-2"
            aria-label="Zoom in"
          >
            <Plus className="size-4" strokeWidth={2.2} />
          </button>
          <span className="mx-auto block h-px w-6 bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => bumpZoom(-1)}
            className="grid size-10 place-items-center text-fg hover:bg-surface-2"
            aria-label="Zoom out"
          >
            <Minus className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {selected ? (
        <div className="absolute inset-x-3 bottom-3 z-[400] overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border lg:bottom-3">
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
                {displayDistance(selected.distanceKm, distanceUnit)} {distanceUnit === "mi" ? t("mi") : t("km")}
                {" \u00b7 "}
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
  | { kind: "group"; lat: number; lng: number; count: number; items: DaycareCard[] };

function logoPinEl(className: string) {
  const content = document.createElement("div");
  content.className = className;
  content.innerHTML = PIN_SVG;
  content.setAttribute("role", "button");
  return content;
}

function clusterEl(count: number) {
  const content = document.createElement("div");
  const size = count >= 200 ? "xl" : count >= 50 ? "lg" : count >= 10 ? "md" : "sm";
  content.className = `ke-count-cluster ke-count-cluster--${size}`;
  content.textContent = count > 999 ? "999+" : String(count);
  content.setAttribute("role", "button");
  content.setAttribute("aria-label", `${count} licensed centres`);
  return content;
}

function pinIcon(maps: typeof google.maps, size: number): google.maps.Icon {
  return {
    url: PIN_DATA_URL,
    scaledSize: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size),
  };
}

function wrapOverlayPin(overlay: ListingOverlay): SlugPin {
  return {
    setMap(map) {
      overlay.setMap(map);
    },
    setActive(on) {
      overlay.getElement().classList.toggle("is-active", on);
      overlay.setZIndex(on ? 500 : 10);
    },
  };
}

function wrapClassicPin(marker: google.maps.Marker): SlugPin {
  return {
    setMap(map) {
      marker.setMap(map);
    },
    setActive(on, maps) {
      marker.setIcon(pinIcon(maps, on ? 46 : 36));
      marker.setZIndex(on ? 500 : 10);
    },
  };
}

function clusterCellDegrees(zoom: number): number {
  if (zoom >= 15) return 0;
  if (zoom >= 14) return 0.012;
  if (zoom >= 13) return 0.022;
  if (zoom >= 12) return 0.038;
  if (zoom >= 11) return 0.07;
  if (zoom >= 10) return 0.13;
  if (zoom >= 9) return 0.22;
  if (zoom >= 8) return 0.36;
  if (zoom >= 7) return 0.55;
  return 0.85;
}

function clusterItems(items: DaycareCard[], zoom: number): ClusterNode[] {
  const usable = items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  const cell = clusterCellDegrees(zoom);
  if (cell <= 0 || usable.length < 2) return usable.map((item) => ({ kind: "pin", item }));

  const buckets = new Map<string, DaycareCard[]>();
  for (const item of usable) {
    const key = `${Math.round(item.lat / cell)}_${Math.round(item.lng / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  type Group = { lat: number; lng: number; items: DaycareCard[] };
  const groups: Group[] = [];
  for (const list of buckets.values()) {
    const lat = list.reduce((s, i) => s + i.lat, 0) / list.length;
    const lng = list.reduce((s, i) => s + i.lng, 0) / list.length;
    groups.push({ lat, lng, items: list });
  }

  const minSep = cell * 0.72;
  const minSep2 = minSep * minSep;
  const merged = new Array(groups.length).fill(false);
  const out: ClusterNode[] = [];
  for (let i = 0; i < groups.length; i++) {
    if (merged[i]) continue;
    let lat = groups[i].lat * groups[i].items.length;
    let lng = groups[i].lng * groups[i].items.length;
    const pack = [...groups[i].items];
    for (let j = i + 1; j < groups.length; j++) {
      if (merged[j]) continue;
      const dLat = groups[i].lat - groups[j].lat;
      const dLng = (groups[i].lng - groups[j].lng) * Math.cos((groups[i].lat * Math.PI) / 180);
      if (dLat * dLat + dLng * dLng > minSep2) continue;
      merged[j] = true;
      lat += groups[j].lat * groups[j].items.length;
      lng += groups[j].lng * groups[j].items.length;
      pack.push(...groups[j].items);
    }
    if (pack.length === 1) {
      out.push({ kind: "pin", item: pack[0] });
      continue;
    }
    out.push({
      kind: "group",
      lat: lat / pack.length,
      lng: lng / pack.length,
      count: pack.length,
      items: pack,
    });
  }
  return out;
}
