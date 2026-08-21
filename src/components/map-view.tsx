import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Navigation } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { DaycareCard } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { mapZoomForRadius, openDirections, readMapBase, writeMapBase, type MapBase } from "@/lib/maps";
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

type LMap = import("leaflet").Map;
type LMarker = import("leaflet").Marker;
type LTile = import("leaflet").TileLayer;
type LLayer = import("leaflet").LayerGroup;
type LCircle = import("leaflet").Circle;

export function MapView({ items, origin, radiusKm, activeSlug, onSelect, onRelocate }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const tilesRef = useRef<{ road: LTile; sat: LTile } | null>(null);
  const pinsRef = useRef<LLayer | null>(null);
  const youRef = useRef<LLayer | null>(null);
  const circleRef = useRef<LCircle | null>(null);
  const markersBySlug = useRef(new Map<string, LMarker>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const locale = useAppStore((s) => s.locale);
  const { t } = useCopy();
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [base, setBase] = useState<MapBase>(() => readMapBase());
  const [picked, setPicked] = useState<string | null>(activeSlug ?? null);
  const [locating, setLocating] = useState(false);

  const selected = useMemo(
    () => items.find((i) => i.slug === (picked || activeSlug)) ?? null,
    [items, picked, activeSlug],
  );

  useEffect(() => {
    if (activeSlug) setPicked(activeSlug);
  }, [activeSlug]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let map: LMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !el) return;
      el.innerHTML = "";
      map = L.map(el, {
        zoomControl: false,
        scrollWheelZoom: true,
        attributionControl: true,
        preferCanvas: true,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const road = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
        subdomains: "abcd",
        updateWhenIdle: true,
        keepBuffer: 2,
      });
      const sat = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri",
          maxZoom: 19,
          updateWhenIdle: true,
          keepBuffer: 2,
        },
      );
      (readMapBase() === "satellite" ? sat : road).addTo(map);
      map.setView([origin.lat, origin.lng], mapZoomForRadius(radiusKm));
      const live = map;
      live.on("zoomend", () => setZoom(live.getZoom()));
      setZoom(live.getZoom());
      mapRef.current = map;
      tilesRef.current = { road, sat };
      pinsRef.current = L.layerGroup().addTo(map);
      youRef.current = L.layerGroup().addTo(map);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      setReady(false);
      map?.remove();
      mapRef.current = null;
      tilesRef.current = null;
      pinsRef.current = null;
      youRef.current = null;
      circleRef.current = null;
      markersBySlug.current.clear();
    };
    // Created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const el = host.current;
    if (!map || !el || !ready) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    map.invalidateSize();
    return () => ro.disconnect();
  }, [ready]);

  useEffect(() => {
    const tiles = tilesRef.current;
    const map = mapRef.current;
    if (!tiles || !map || !ready) return;
    const next = base === "satellite" ? tiles.sat : tiles.road;
    const prev = base === "satellite" ? tiles.road : tiles.sat;
    if (!map.hasLayer(next)) next.addTo(map);
    if (map.hasLayer(prev)) map.removeLayer(prev);
    writeMapBase(base);
  }, [base, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setView([origin.lat, origin.lng], mapZoomForRadius(radiusKm), { animate: true });
    void import("leaflet").then((L) => {
      if (circleRef.current) {
        circleRef.current.setLatLng([origin.lat, origin.lng]);
        circleRef.current.setRadius(Math.max(radiusKm, 0.5) * 1000);
      } else {
        circleRef.current = L.circle([origin.lat, origin.lng], {
          radius: Math.max(radiusKm, 0.5) * 1000,
          color: "#1a3790",
          weight: 1,
          fillColor: "#1a3790",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(map);
      }
      youRef.current?.clearLayers();
      L.circleMarker([origin.lat, origin.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#1a3790",
        fillOpacity: 1,
        interactive: false,
      }).addTo(youRef.current!);
    });
  }, [origin.lat, origin.lng, radiusKm, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const group = pinsRef.current;
    if (!map || !group || !ready) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled) return;
      group.clearLayers();
      markersBySlug.current.clear();
      const clusters = clusterItems(items, zoom);
      for (const node of clusters) {
        if (node.kind === "group") {
          const icon = L.divIcon({
            className: "ke-cluster",
            html: `<span>${node.count}</span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          L.marker([node.lat, node.lng], { icon, zIndexOffset: 100 })
            .on("click", () => map.setView([node.lat, node.lng], Math.min(zoom + 2, 16), { animate: true }))
            .addTo(group);
          continue;
        }
        const item = node.item;
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
        const live = Boolean(item.live);
        const icon = L.divIcon({
          className: `dn-pin${live ? " is-live" : " is-unclaimed"}`,
          html: live
            ? `<span class="ke-pin-check">✓</span><span>${pinFeeLabel(item.province, true, item.fromPrice, locale, money)}</span>`
            : `<span>${pinFeeLabel(item.province, false, item.fromPrice, locale, money)}</span>`,
          iconSize: live ? [84, 28] : [72, 28],
          iconAnchor: live ? [42, 28] : [36, 28],
        });
        const marker = L.marker([item.lat, item.lng], { icon });
        marker.on("click", () => {
          setPicked(item.slug);
          onSelectRef.current(item.slug);
        });
        marker.addTo(group);
        markersBySlug.current.set(item.slug, marker);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [items, locale, ready, zoom]);

  useEffect(() => {
    const slug = picked || activeSlug;
    for (const [id, marker] of markersBySlug.current) {
      const el = marker.getElement();
      if (el) el.classList.toggle("is-active", id === slug);
      marker.setZIndexOffset(id === slug ? 500 : 0);
    }
  }, [picked, activeSlug, zoom, items]);

  async function locateMe() {
    setLocating(true);
    const pos = await getDeviceLocation();
    setLocating(false);
    if (!pos) return;
    mapRef.current?.setView([pos.lat, pos.lng], 13, { animate: true });
    void hapticLight();
    onRelocate?.(pos);
  }

  return (
    <div className="relative size-full min-h-[280px] overflow-hidden rounded-lg bg-map">
      <div ref={host} className="absolute inset-0" />

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
