/**
 * MapLibre map for search, listing, and area pages.
 *
 * Tiles are OpenFreeMap (OpenStreetMap data, no key, free for production).
 * Satellite is Sentinel-2 cloudless from EOX, also free with attribution.
 * The library is loaded only when a map is opened.
 */
import type { GeoJSONSource, Map as MlMap, Marker, StyleSpecification } from "maplibre-gl";

export const OSM_ROAD_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const OSM_TILE_HOST = "https://tiles.openfreemap.org";
export const SATELLITE_TILE_HOST = "https://tiles.maps.eox.at";
export const SATELLITE_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg";

/** How long to wait for the first idle frame before the Retry button. */
export const MAP_STYLE_WAIT_MS = 12_000;
/**
 * Search-map skeleton stays up through the style wait so a slow first
 * paint is not replaced by "Map is taking too long" too early.
 */
export const MAP_VIEW_WAIT_MS = 28_000;

export const MAP_LOAD_TIMEOUT = "Map timed out";

export type LatLng = { lat: number; lng: number };

export type MapPoint = {
  lat(): number;
  lng(): number;
};

export class MapLngLat implements MapPoint {
  private readonly latitude: number;
  private readonly longitude: number;
  constructor(latitude: number, longitude: number) {
    this.latitude = latitude;
    this.longitude = longitude;
  }
  lat() {
    return this.latitude;
  }
  lng() {
    return this.longitude;
  }
}

export class MapBounds {
  private blank = true;
  private south = 0;
  private north = 0;
  private west = 0;
  private east = 0;

  constructor(sw?: LatLng, ne?: LatLng) {
    if (!sw || !ne) return;
    this.blank = false;
    this.south = Math.min(sw.lat, ne.lat);
    this.north = Math.max(sw.lat, ne.lat);
    this.west = Math.min(sw.lng, ne.lng);
    this.east = Math.max(sw.lng, ne.lng);
  }

  extend(point: LatLng) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    if (this.blank) {
      this.blank = false;
      this.south = point.lat;
      this.north = point.lat;
      this.west = point.lng;
      this.east = point.lng;
      return;
    }
    this.south = Math.min(this.south, point.lat);
    this.north = Math.max(this.north, point.lat);
    this.west = Math.min(this.west, point.lng);
    this.east = Math.max(this.east, point.lng);
  }

  isEmpty() {
    return this.blank;
  }

  getSouthWest(): MapPoint {
    return new MapLngLat(this.south, this.west);
  }

  getNorthEast(): MapPoint {
    return new MapLngLat(this.north, this.east);
  }

  toLngLatBounds(): [[number, number], [number, number]] {
    return [
      [this.west, this.south],
      [this.east, this.north],
    ];
  }
}

export type MapListener = { remove(): void };

type Padding = { top: number; right: number; bottom: number; left: number };

export type CircleStyle = {
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
  fillColor: string;
  fillOpacity: number;
  clickable?: boolean;
  zIndex?: number;
};

type MlModule = typeof import("maplibre-gl");

let libPromise: Promise<MlModule> | null = null;

export function preloadOsmMap(): Promise<MlModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("Map is browser-only"));
  if (!libPromise) {
    libPromise = (async () => {
      const [ml, worker] = await Promise.all([
        import("maplibre-gl"),
        import("maplibre-gl/dist/maplibre-gl-csp-worker.js?url"),
        import("maplibre-gl/dist/maplibre-gl.css"),
      ]);
      ml.setWorkerUrl(worker.default);
      return ml;
    })().catch((err) => {
      libPromise = null;
      throw err;
    });
  }
  return libPromise;
}

/** @deprecated Use preloadOsmMap. Kept so search can warm the library. */
export const loadOsmMap = preloadOsmMap;

function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        maxzoom: 15,
        attribution:
          'Sentinel-2 cloudless © <a href="https://eox.at" target="_blank" rel="noreferrer">EOX</a> (Copernicus Sentinel data)',
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  };
}

export function osmMapTypeId(base: "roadmap" | "satellite"): "roadmap" | "hybrid" {
  return base === "satellite" ? "hybrid" : "roadmap";
}

/** Closed ring around a point. Used for the search-radius outline. */
export function circleRing(center: LatLng, radiusM: number, steps = 64): [number, number][] {
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const angular = radiusM / 6371008.8;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * Math.PI * 2;
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
        Math.cos(angular) - Math.sin(lat) * Math.sin(lat2),
      );
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  const first = ring[0];
  if (first) ring[ring.length - 1] = first;
  return ring;
}

function boundsForRadius(center: LatLng, radiusM: number): MapBounds {
  const ring = circleRing(center, radiusM, 32);
  const bounds = new MapBounds();
  for (const [lng, lat] of ring) bounds.extend({ lat, lng });
  return bounds;
}

let circleSeq = 0;

export class OsmMap {
  private ml: MlMap;
  private lib: MlModule;
  readonly host: HTMLElement;
  private listeners = new Map<string, Set<() => void>>();
  private overlays = new Set<OsmOverlay>();
  private circles = new Set<OsmCircle>();
  private pane: HTMLDivElement;
  private basemap: "roadmap" | "satellite" = "roadmap";
  private dead = false;
  private onRender = () => {
    if (this.dead) return;
    for (const overlay of this.overlays) overlay.draw();
  };

  constructor(ml: MlMap, lib: MlModule, host: HTMLElement, basemap: "roadmap" | "satellite" = "roadmap") {
    this.ml = ml;
    this.lib = lib;
    this.host = host;
    this.basemap = basemap;
    this.pane = document.createElement("div");
    this.pane.className = "ke-osm-overlay";
    this.pane.setAttribute("aria-hidden", "true");
    this.host.appendChild(this.pane);
    this.ml.on("render", this.onRender);
    this.ml.on("zoom", () => this.emit("zoom_changed"));
    this.ml.on("dragstart", () => this.emit("dragstart"));
    this.ml.on("idle", () => this.emit("idle"));
    this.ml.on("click", () => this.emit("click"));
    this.ml.once("style.load", () => this.repaintCircles());
  }

  overlayPane() {
    return this.pane;
  }

  marker(opts: { element: HTMLElement; anchor: "center" | "bottom"; lng: number; lat: number }): Marker {
    const marker = new this.lib.Marker({ element: opts.element, anchor: opts.anchor })
      .setLngLat([opts.lng, opts.lat])
      .addTo(this.ml);
    return marker;
  }

  private emit(name: string) {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) fn();
  }

  addListener(name: string, fn: () => void): MapListener {
    const set = this.listeners.get(name) ?? new Set<() => void>();
    set.add(fn);
    this.listeners.set(name, set);
    return {
      remove: () => {
        set.delete(fn);
      },
    };
  }

  clearListeners() {
    this.listeners.clear();
  }

  containerPixel(lat: number, lng: number): { x: number; y: number } | null {
    if (this.dead || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    try {
      const point = this.ml.project([lng, lat]);
      return { x: point.x, y: point.y };
    } catch {
      return null;
    }
  }

  /** Overlay pixels. (0, 0) is the centre of the map, matching the old pin canvas. */
  divPixel(lat: number, lng: number): { x: number; y: number } | null {
    const point = this.containerPixel(lat, lng);
    if (!point) return null;
    return {
      x: point.x - this.host.clientWidth / 2,
      y: point.y - this.host.clientHeight / 2,
    };
  }

  setCenter(position: LatLng) {
    this.ml.jumpTo({ center: [position.lng, position.lat] });
  }

  getCenter(): MapPoint | null {
    const center = this.ml.getCenter();
    if (!center) return null;
    return new MapLngLat(center.lat, center.lng);
  }

  getZoom(): number | undefined {
    const zoom = this.ml.getZoom();
    return typeof zoom === "number" ? zoom : undefined;
  }

  setZoom(zoom: number) {
    this.ml.easeTo({ zoom, duration: 180 });
  }

  panTo(position: LatLng) {
    this.ml.easeTo({ center: [position.lng, position.lat], duration: 280 });
  }

  fitBounds(bounds: MapBounds, padding?: number | Padding) {
    if (bounds.isEmpty()) return;
    const pad =
      typeof padding === "number"
        ? { top: padding, right: padding, bottom: padding, left: padding }
        : (padding ?? { top: 0, right: 0, bottom: 0, left: 0 });
    this.ml.fitBounds(bounds.toLngLatBounds(), { padding: pad, animate: false, maxZoom: 16 });
  }

  getBounds(): MapBounds | null {
    const box = this.ml.getBounds();
    if (!box) return null;
    return new MapBounds(
      { lat: box.getSouth(), lng: box.getWest() },
      { lat: box.getNorth(), lng: box.getEast() },
    );
  }

  getDiv() {
    return this.host;
  }

  setMapTypeId(id: string) {
    const next = id === "hybrid" || id === "satellite" ? "satellite" : "roadmap";
    if (next === this.basemap) return;
    this.basemap = next;
    this.ml.setStyle(next === "satellite" ? satelliteStyle() : OSM_ROAD_STYLE);
    this.ml.once("style.load", () => this.repaintCircles());
  }

  resize() {
    this.ml.resize();
    this.emit("resize");
  }

  attachOverlay(overlay: OsmOverlay) {
    this.overlays.add(overlay);
  }

  detachOverlay(overlay: OsmOverlay) {
    this.overlays.delete(overlay);
  }

  attachCircle(circle: OsmCircle) {
    this.circles.add(circle);
  }

  detachCircle(circle: OsmCircle) {
    this.circles.delete(circle);
  }

  upsertCircle(id: string, center: LatLng, radiusM: number, style: CircleStyle) {
    if (this.dead || !this.ml.isStyleLoaded()) return;
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [circleRing(center, radiusM)] },
    };
    const source = this.ml.getSource(id) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else this.ml.addSource(id, { type: "geojson", data });
    const fillId = `${id}-fill`;
    const lineId = `${id}-line`;
    if (!this.ml.getLayer(fillId)) {
      this.ml.addLayer({
        id: fillId,
        type: "fill",
        source: id,
        paint: { "fill-color": style.fillColor, "fill-opacity": style.fillOpacity },
      });
    } else {
      this.ml.setPaintProperty(fillId, "fill-color", style.fillColor);
      this.ml.setPaintProperty(fillId, "fill-opacity", style.fillOpacity);
    }
    if (!this.ml.getLayer(lineId)) {
      this.ml.addLayer({
        id: lineId,
        type: "line",
        source: id,
        paint: {
          "line-color": style.strokeColor,
          "line-opacity": style.strokeOpacity,
          "line-width": style.strokeWeight,
        },
      });
    } else {
      this.ml.setPaintProperty(lineId, "line-color", style.strokeColor);
      this.ml.setPaintProperty(lineId, "line-opacity", style.strokeOpacity);
      this.ml.setPaintProperty(lineId, "line-width", style.strokeWeight);
    }
  }

  removeCircle(id: string) {
    if (this.dead) return;
    for (const layer of [`${id}-fill`, `${id}-line`]) {
      if (this.ml.getLayer(layer)) this.ml.removeLayer(layer);
    }
    if (this.ml.getSource(id)) this.ml.removeSource(id);
  }

  private repaintCircles() {
    if (this.dead) return;
    for (const circle of this.circles) circle.paint();
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.listeners.clear();
    this.ml.off("render", this.onRender);
    for (const overlay of [...this.overlays]) overlay.setMap(null);
    for (const circle of [...this.circles]) circle.setMap(null);
    this.pane.remove();
    this.ml.remove();
  }
}

export class OsmOverlay {
  onAdd(): void {}
  draw(): void {}
  onRemove(): void {}
  private map: OsmMap | null = null;

  setMap(map: OsmMap | null) {
    if (this.map === map) return;
    if (this.map) {
      this.map.detachOverlay(this);
      this.onRemove();
    }
    this.map = map;
    if (map) {
      map.attachOverlay(this);
      this.onAdd();
      this.draw();
    }
  }

  getPanes(): { overlayMouseTarget: HTMLElement } | null {
    if (!this.map) return null;
    return { overlayMouseTarget: this.map.overlayPane() };
  }

  getProjection() {
    const map = this.map;
    if (!map) return null;
    return {
      fromLatLngToDivPixel: (point: MapPoint) => map.divPixel(point.lat(), point.lng()),
      fromLatLngToContainerPixel: (point: MapPoint) => map.containerPixel(point.lat(), point.lng()),
    };
  }
}

export class OsmCircle {
  private map: OsmMap | null;
  private center: LatLng;
  private radiusM: number;
  private style: CircleStyle;
  private id: string;
  private shown = false;

  constructor(opts: { map: OsmMap; center: LatLng; radius: number } & CircleStyle) {
    this.map = opts.map;
    this.center = opts.center;
    this.radiusM = opts.radius;
    this.style = opts;
    this.id = `ke-radius-${(circleSeq += 1)}`;
    this.shown = true;
    this.map.attachCircle(this);
    this.paint();
  }

  setCenter(center: LatLng) {
    this.center = center;
    this.paint();
  }

  setRadius(radius: number) {
    this.radiusM = radius;
    this.paint();
  }

  setOptions(style: CircleStyle) {
    this.style = { ...this.style, ...style };
    this.paint();
  }

  setMap(map: OsmMap | null) {
    if (this.map && this.shown) this.map.removeCircle(this.id);
    if (this.map) this.map.detachCircle(this);
    this.map = map;
    this.shown = Boolean(map);
    if (map) {
      map.attachCircle(this);
      this.paint();
    }
  }

  getBounds() {
    return boundsForRadius(this.center, this.radiusM);
  }

  paint() {
    if (!this.map || !this.shown) return;
    this.map.upsertCircle(this.id, this.center, this.radiusM, this.style);
  }
}

export type ListingOverlay = {
  setMap(map: OsmMap | null): void;
  getElement(): HTMLElement;
  setZIndex(z: number): void;
};

export function createListingOverlay(opts: {
  map: OsmMap;
  position: LatLng;
  content: HTMLElement;
  onClick?: () => void;
  centered?: boolean;
  zIndex?: number;
  collision?: string;
}): ListingOverlay {
  const content = opts.content;
  if (opts.zIndex != null) content.style.zIndex = String(opts.zIndex);
  let marker: Marker | null = opts.map.marker({
    element: content,
    anchor: opts.centered ? "center" : "bottom",
    lng: opts.position.lng,
    lat: opts.position.lat,
  });
  if (opts.onClick) {
    content.addEventListener("click", (event) => {
      event.stopPropagation();
      opts.onClick?.();
    });
  }
  return {
    setMap(map) {
      if (!map) {
        marker?.remove();
        marker = null;
        return;
      }
      if (!marker) {
        marker = map.marker({
          element: content,
          anchor: opts.centered ? "center" : "bottom",
          lng: opts.position.lng,
          lat: opts.position.lat,
        });
      }
    },
    getElement() {
      return content;
    },
    setZIndex(z) {
      content.style.zIndex = String(z);
    },
  };
}

export type MovableDot = {
  setPosition(position: LatLng): void;
  setMap(map: OsmMap | null): void;
};

export function createYouAreHereDot(opts: { map: OsmMap; position: LatLng }): MovableDot {
  const content = document.createElement("div");
  content.className = "ke-you-dot";
  content.style.pointerEvents = "none";
  content.setAttribute("aria-hidden", "true");
  let marker: Marker | null = opts.map.marker({
    element: content,
    anchor: "center",
    lng: opts.position.lng,
    lat: opts.position.lat,
  });
  let position = opts.position;
  return {
    setPosition(next) {
      position = next;
      marker?.setLngLat([next.lng, next.lat]);
    },
    setMap(map) {
      if (!map) {
        marker?.remove();
        marker = null;
        return;
      }
      if (!marker) {
        marker = map.marker({
          element: content,
          anchor: "center",
          lng: position.lng,
          lat: position.lat,
        });
      }
    },
  };
}

export const osmMaps = {
  event: {
    addListener(map: OsmMap, name: string, fn: () => void) {
      return map.addListener(name, fn);
    },
    addListenerOnce(map: OsmMap, name: string, fn: () => void) {
      const listener = map.addListener(name, () => {
        listener.remove();
        fn();
      });
      return listener;
    },
    removeListener(listener?: MapListener | null) {
      listener?.remove();
    },
    trigger(map: OsmMap, name: string) {
      if (name === "resize") map.resize();
    },
    clearInstanceListeners(map: OsmMap) {
      map.clearListeners();
    },
  },
  LatLng: MapLngLat,
  LatLngBounds: MapBounds,
  Circle: OsmCircle,
  OverlayView: OsmOverlay,
};

export async function createKidEaseMap(
  el: HTMLElement,
  input: {
    center: LatLng;
    zoom: number;
    mapTypeId: "roadmap" | "hybrid" | "satellite";
    cooperative?: boolean;
  },
): Promise<{ map: OsmMap; maps: typeof osmMaps; tilesReady: boolean }> {
  const lib = await preloadOsmMap();
  const satellite = input.mapTypeId === "hybrid" || input.mapTypeId === "satellite";
  const basemap = satellite ? "satellite" : "roadmap";
  const ml = new lib.Map({
    container: el,
    style: satellite ? satelliteStyle() : OSM_ROAD_STYLE,
    center: [input.center.lng, input.center.lat],
    zoom: input.zoom,
    attributionControl: false,
    cooperativeGestures: Boolean(input.cooperative),
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    fadeDuration: 0,
    maxZoom: 18,
    minZoom: 3,
  });
  ml.addControl(new lib.AttributionControl({ compact: false }), "bottom-left");
  const map = new OsmMap(ml, lib, el, basemap);
  const tilesReady = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), MAP_STYLE_WAIT_MS);
    ml.once("idle", () => finish(true));
  });
  if (!tilesReady) {
    map.destroy();
    throw new Error(MAP_LOAD_TIMEOUT);
  }
  return { map, maps: osmMaps, tilesReady };
}
