import { isPublicListing } from "./listing-visibility.ts";

/**
 * Viewport drawing for the search map.
 *
 * The list query (NEON_NEAR_SQL) stops at SEARCH_LIST_CAP. That cap, drawn
 * with a coarse grid, is what put one "400" bubble on the Winnipeg map.
 * Map reads keep every public listing in the viewport.
 *
 * At city and search-radius zoom each listing is its own KidEase logo pin,
 * on every viewport. A count bubble is only for pins that sit within MAP_OVERLAP_PX
 * of each other on screen, and only once that distance is a short walk
 * (see MAP_OVERLAP_MAX_KM). Zoomed out past a city (below MAP_CITY_ZOOM),
 * the grid switches to area bubbles. The width of the padded camera does
 * not change that: a 25 km search on a desktop map is still pin mode.
 */

export const SEARCH_LIST_CAP = 400;

/** Cluster radius in screen pixels. Pins farther apart stay separate. */
export const MAP_OVERLAP_PX = 40;

/**
 * Area-bubble cell when the camera is zoomed out past a city search.
 * About one bubble per place, not one bubble for the whole province.
 */
export const MAP_AREA_PX = 72;

/**
 * Merge area cells whose centroids are closer than this fraction of a cell.
 * Stops overlapping bubbles without pulling the next city in.
 */
export const MAP_MERGE_FRAC = 0.62;

/**
 * Search-radius zoom and closer (25 km is zoom 10). Listings are logo pins.
 * Below this, the map is a province view and uses area bubbles.
 */
export const MAP_CITY_ZOOM = 8;

/**
 * A 40px radius at zoom 10 is several kilometres and would hide the city.
 * Overlap bubbles start only once 40px is this short on the ground.
 */
export const MAP_OVERLAP_MAX_KM = 0.45;

/**
 * Half of the 28px pin hit target. Overlapping pins resolve to the centre
 * closest to the click, not whichever button is painted on top.
 */
export const MAP_DOT_HIT_PX = 14;

/** Full KidEase logo pin, the same artwork as the selected listing. */
export const MAP_LOGO_PIN_PX = 36;

/** Selected listing. Stays this size at every zoom, with the popup. */
export const MAP_LOGO_PIN_ACTIVE_PX = 44;

/**
 * Painted size at radius-fit and city zoom (below 12). Smaller than the
 * full pin so a dense downtown does not turn into one blob.
 */
export const MAP_LOGO_PIN_CITY_PX = 24;

/** Minimum tap target. The painted pin may be smaller; the button is not. */
export const MAP_PIN_TAP_PX = 28;

/** Logo pin height in CSS pixels. Zoom 12 and closer is the full pin. */
export function mapLogoPinPx(zoom: number): number {
  return clampMapZoom(zoom) >= 12 ? MAP_LOGO_PIN_PX : MAP_LOGO_PIN_CITY_PX;
}

/** Square hit target. At least 28px, and never smaller than the painted pin. */
export function mapPinTapPx(zoom: number): number {
  return Math.max(MAP_PIN_TAP_PX, mapLogoPinPx(zoom));
}

/** Wait until the camera settles so a pan does not fire a request per frame. */
export const MAP_FETCH_DEBOUNCE_MS = 450;

export const MAP_VIEW_CACHE_MS = 90_000;

const METERS_PER_PX_ZOOM0 = 156543.03392;

export type MapBbox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type MapPin = {
  id: string;
  slug: string;
  name: string;
  nameFr: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  province: string;
  postalCode: string;
};

export type MapCluster = {
  lat: number;
  lng: number;
  count: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** Set only when this cell is a single listing, so it can open the pin popup. */
  pin?: MapPin;
};

export type MapViewData = {
  bbox: MapBbox;
  zoom: number;
  total: number;
  /** Map loads never drop rows to hit a page size. Aggregation is not truncation. */
  truncated: false;
} & ({ mode: "clusters"; clusters: MapCluster[] } | { mode: "pins"; pins: MapPin[] });

export type MapMarker<T> =
  | { kind: "pin"; item: T; lat: number; lng: number }
  | {
      kind: "group";
      lat: number;
      lng: number;
      count: number;
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    };

type Weighted<T> = {
  lat: number;
  lng: number;
  count: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  items: T[];
};

export function clampMapZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 10;
  return Math.min(18, Math.max(3, zoom));
}

export function clusterPixelSpan(zoom: number): number {
  return clampMapZoom(zoom) < MAP_CITY_ZOOM ? MAP_AREA_PX : MAP_OVERLAP_PX;
}

export function clusterCellSize(zoom: number, lat: number) {
  const z = clampMapZoom(zoom);
  const clampedLat = Math.max(-80, Math.min(80, Number.isFinite(lat) ? lat : 50));
  const cos = Math.cos((clampedLat * Math.PI) / 180);
  const safeCos = Math.abs(cos) < 0.2 ? 0.2 : Math.abs(cos);
  const metersPerPx = (METERS_PER_PX_ZOOM0 * safeCos) / 2 ** z;
  const km = (clusterPixelSpan(z) * metersPerPx) / 1000;
  return {
    km,
    latDeg: km / 110.574,
    lngDeg: km / (111.32 * safeCos),
  };
}

/**
 * Ground distance at which markers share a bubble.
 * Null means draw every listing: a 40px group would cover a neighbourhood.
 */
export function groupingKm(zoom: number, lat: number): number | null {
  const z = clampMapZoom(zoom);
  const cell = clusterCellSize(z, lat);
  if (z < MAP_CITY_ZOOM) return cell.km;
  if (cell.km <= MAP_OVERLAP_MAX_KM) return cell.km;
  return null;
}

export function mapSpanKm(box: MapBbox): number {
  const mid = (box.minLat + box.maxLat) / 2;
  const cos = Math.cos((mid * Math.PI) / 180);
  const latKm = Math.abs(box.maxLat - box.minLat) * 110.574;
  const lngKm = Math.abs(box.maxLng - box.minLng) * 111.32 * Math.max(0.2, Math.abs(cos));
  return Math.max(latKm, lngKm);
}

/**
 * Pins at city and search-radius zoom, including a wide desktop camera.
 * Area bubbles only when the zoom itself is a province view.
 * `box` is unused: a padded bbox can be hundreds of kilometres at zoom 9
 * and must not flip the search-radius view into clusters.
 */
export function mapLoadMode(zoom: number, _box?: MapBbox): "clusters" | "pins" {
  return clampMapZoom(zoom) < MAP_CITY_ZOOM ? "clusters" : "pins";
}

/** Closest dot centre within the hit radius. A farther overlapping target loses. */
export function pickNearestMapDot<T>(
  pins: readonly T[],
  centers: readonly { x: number; y: number }[],
  click: { x: number; y: number },
  maxPx = MAP_DOT_HIT_PX,
): T | null {
  if (!Number.isFinite(click.x) || !Number.isFinite(click.y)) return null;
  const max2 = maxPx * maxPx;
  let best = -1;
  let bestD = max2;
  const n = Math.min(pins.length, centers.length);
  for (let i = 0; i < n; i++) {
    const center = centers[i];
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) continue;
    const dx = center.x - click.x;
    const dy = center.y - click.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? (pins[best] ?? null) : null;
}

export function pointInBbox(point: { lat: number; lng: number }, box: MapBbox): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lng >= box.minLng &&
    point.lng <= box.maxLng
  );
}

export function collectPublicMapPins(
  rows: Array<{
    id?: string | null;
    slug?: string | null;
    name?: string | null;
    nameFr?: string | null;
    lat: number;
    lng: number;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    licenseNumber?: string | null;
    visibility?: string | null;
    isTest?: boolean | number | null;
  }>,
  box: MapBbox,
): MapPin[] {
  const out: MapPin[] = [];
  for (const row of rows) {
    if (!usableMapPoint(row) || !pointInBbox(row, box)) continue;
    const id = String(row.id || "").trim();
    const slug = String(row.slug || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !slug || !name) continue;
    if (
      !isPublicListing({
        id,
        slug,
        name,
        licenseNumber: row.licenseNumber,
        address: row.address,
        visibility: row.visibility,
        isTest: row.isTest,
      })
    ) {
      continue;
    }
    out.push({
      id,
      slug,
      name,
      nameFr: String(row.nameFr || "").trim(),
      lat: row.lat,
      lng: row.lng,
      address: row.address || "",
      city: row.city || "",
      province: row.province || "",
      postalCode: row.postalCode || "",
    });
  }
  return out;
}

export function usableMapPoint(point: { lat: number; lng: number }): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && !(point.lat === 0 && point.lng === 0);
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function combine<T>(pack: Weighted<T>[]): Weighted<T> {
  let count = 0;
  let lat = 0;
  let lng = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  const items: T[] = [];
  for (const cell of pack) {
    count += cell.count;
    lat += cell.lat * cell.count;
    lng += cell.lng * cell.count;
    if (cell.minLat < minLat) minLat = cell.minLat;
    if (cell.maxLat > maxLat) maxLat = cell.maxLat;
    if (cell.minLng < minLng) minLng = cell.minLng;
    if (cell.maxLng > maxLng) maxLng = cell.maxLng;
    items.push(...cell.items);
  }
  return {
    lat: lat / count,
    lng: lng / count,
    count,
    minLat,
    maxLat,
    minLng,
    maxLng,
    items,
  };
}

function mergeWeighted<T>(cells: Weighted<T>[], minSepKm: number): Weighted<T>[] {
  const merged = new Array(cells.length).fill(false);
  const out: Weighted<T>[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (merged[i]) continue;
    const pack = [cells[i]!];
    for (let j = i + 1; j < cells.length; j++) {
      if (merged[j]) continue;
      if (haversineKm(cells[i]!, cells[j]!) > minSepKm) continue;
      merged[j] = true;
      pack.push(cells[j]!);
    }
    out.push(combine(pack));
  }
  return out;
}

function singleCells<T extends { lat: number; lng: number }>(points: T[]): Weighted<T>[] {
  return points.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    count: 1,
    minLat: point.lat,
    maxLat: point.lat,
    minLng: point.lng,
    maxLng: point.lng,
    items: [point],
  }));
}

/** Grid, then a short merge so neighbouring cells do not stack on each other. */
export function clusterMapPoints<T extends { lat: number; lng: number }>(
  points: T[],
  zoom: number,
  atLat?: number,
): Weighted<T>[] {
  const usable = points.filter(usableMapPoint);
  if (usable.length === 0) return [];
  const lat = atLat ?? usable.reduce((sum, point) => sum + point.lat, 0) / usable.length;
  const radiusKm = groupingKm(zoom, lat);
  if (radiusKm == null) return singleCells(usable);
  const cos = Math.cos((Math.max(-80, Math.min(80, lat)) * Math.PI) / 180);
  const safeCos = Math.abs(cos) < 0.2 ? 0.2 : Math.abs(cos);
  const cell = {
    km: radiusKm,
    latDeg: radiusKm / 110.574,
    lngDeg: radiusKm / (111.32 * safeCos),
  };
  const buckets = new Map<string, T[]>();
  for (const point of usable) {
    const key = `${Math.floor(point.lat / cell.latDeg)}_${Math.floor(point.lng / cell.lngDeg)}`;
    const list = buckets.get(key);
    if (list) list.push(point);
    else buckets.set(key, [point]);
  }
  const cells: Weighted<T>[] = [];
  for (const list of buckets.values()) {
    let latSum = 0;
    let lngSum = 0;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const item of list) {
      latSum += item.lat;
      lngSum += item.lng;
      if (item.lat < minLat) minLat = item.lat;
      if (item.lat > maxLat) maxLat = item.lat;
      if (item.lng < minLng) minLng = item.lng;
      if (item.lng > maxLng) maxLng = item.lng;
    }
    const n = list.length;
    cells.push({
      lat: latSum / n,
      lng: lngSum / n,
      count: n,
      minLat,
      maxLat,
      minLng,
      maxLng,
      items: list,
    });
  }
  return mergeWeighted(cells, cell.km * MAP_MERGE_FRAC);
}

export function clusterCountTotal(clusters: Array<{ count: number }>): number {
  return clusters.reduce((sum, cluster) => sum + cluster.count, 0);
}

function toMarker<T extends { lat: number; lng: number }>(node: Weighted<T>): MapMarker<T> {
  if (node.count === 1 && node.items[0]) {
    const item = node.items[0];
    return { kind: "pin", item, lat: item.lat, lng: item.lng };
  }
  return {
    kind: "group",
    lat: node.lat,
    lng: node.lng,
    count: node.count,
    minLat: node.minLat,
    maxLat: node.maxLat,
    minLng: node.minLng,
    maxLng: node.maxLng,
  };
}

function clusterToMarker(cluster: MapCluster): MapMarker<MapPin> {
  if (cluster.count === 1 && cluster.pin) {
    return { kind: "pin", item: cluster.pin, lat: cluster.pin.lat, lng: cluster.pin.lng };
  }
  return {
    kind: "group",
    lat: cluster.lat,
    lng: cluster.lng,
    count: cluster.count,
    minLat: cluster.minLat,
    maxLat: cluster.maxLat,
    minLng: cluster.minLng,
    maxLng: cluster.maxLng,
  };
}

export function markerCount(markers: Array<{ kind: string; count?: number }>): number {
  return markers.reduce((sum, marker) => sum + (marker.kind === "group" ? marker.count || 0 : 1), 0);
}

/**
 * Draw the viewport payload only. The search list is capped at 400 and must
 * not fill the map when a cluster payload is stale or the fetch has not landed.
 */
export function markersForMapView<T extends { lat: number; lng: number }>(input: {
  items?: T[];
  view: MapViewData | null;
  zoom: number;
  bounds: MapBbox | null;
  atLat: number;
}): { markers: Array<MapMarker<T> | MapMarker<MapPin>>; source: "viewport" } {
  const view = input.view;
  const bounds = input.bounds;
  const covers = Boolean(view && bounds && bboxCovers(view.bbox, bounds));
  if (view && covers && view.mode === "pins") {
    return {
      source: "viewport",
      markers: clusterMapPoints(view.pins, input.zoom, input.atLat).map(toMarker),
    };
  }
  if (view && covers && view.mode === "clusters" && Math.round(view.zoom) === Math.round(input.zoom)) {
    return { source: "viewport", markers: view.clusters.map(clusterToMarker) };
  }
  return { source: "viewport", markers: [] };
}

export function projectMapRows(rows: MapPin[], zoom: number, box: MapBbox): MapViewData {
  const inBox = rows.filter((row) => usableMapPoint(row) && pointInBbox(row, box));
  const zoomed = clampMapZoom(zoom);
  const mode = mapLoadMode(zoomed, box);
  const total = inBox.length;
  if (mode === "pins") {
    return { mode: "pins", pins: inBox, total, truncated: false, bbox: box, zoom: zoomed };
  }
  const mid = (box.minLat + box.maxLat) / 2;
  const grouped = clusterMapPoints(inBox, zoomed, mid);
  const clusters = grouped.map((cell) => {
    const cluster: MapCluster = {
      lat: cell.lat,
      lng: cell.lng,
      count: cell.count,
      minLat: cell.minLat,
      maxLat: cell.maxLat,
      minLng: cell.minLng,
      maxLng: cell.maxLng,
    };
    if (cell.count === 1 && cell.items[0]) cluster.pin = cell.items[0];
    return cluster;
  });
  return { mode: "clusters", clusters, total, truncated: false, bbox: box, zoom: zoomed };
}

/** Same merge the point grid uses, for SQL cells that are already bucketed. */
export function mergeMapClusters(clusters: MapCluster[], minSepKm: number): MapCluster[] {
  const weighted: Weighted<MapPin>[] = clusters.map((cluster) => ({
    lat: cluster.lat,
    lng: cluster.lng,
    count: cluster.count,
    minLat: cluster.minLat,
    maxLat: cluster.maxLat,
    minLng: cluster.minLng,
    maxLng: cluster.maxLng,
    items: cluster.pin ? [cluster.pin] : [],
  }));
  return mergeWeighted(weighted, minSepKm).map((cell) => {
    const cluster: MapCluster = {
      lat: cell.lat,
      lng: cell.lng,
      count: cell.count,
      minLat: cell.minLat,
      maxLat: cell.maxLat,
      minLng: cell.minLng,
      maxLng: cell.maxLng,
    };
    if (cell.count === 1 && cell.items[0]) cluster.pin = cell.items[0];
    return cluster;
  });
}

export function clusterAriaLabel(count: number, locale: "en" | "fr" = "en"): string {
  const n = Math.max(0, Math.round(count));
  if (locale === "fr") {
    const noun = n === 1 ? "garderie ici" : "garderies ici";
    return `${n} ${noun}, touchez pour zoomer`;
  }
  const noun = n === 1 ? "daycare here" : "daycares here";
  return `${n} ${noun}, tap to zoom`;
}

export function clusterCountLabel(count: number): string {
  const n = Math.max(0, Math.round(count));
  if (n > 9999) return "9999+";
  return String(n);
}

/** Diameter grows a little with the count and stays inside one cluster cell. */
export function clusterBubblePx(count: number): number {
  const n = Math.max(1, count);
  if (n < 10) return 40;
  if (n < 50) return 42;
  return 44;
}

export function clusterBubbleFontPx(count: number): number {
  const n = Math.max(1, count);
  if (n < 100) return 15;
  if (n < 1000) return 14;
  return 12;
}

export function paddedMapBbox(box: MapBbox, fraction = 0.12): MapBbox {
  const latPad = Math.abs(box.maxLat - box.minLat) * fraction;
  const lngPad = Math.abs(box.maxLng - box.minLng) * fraction;
  return {
    minLat: box.minLat - latPad,
    maxLat: box.maxLat + latPad,
    minLng: box.minLng - lngPad,
    maxLng: box.maxLng + lngPad,
  };
}

export function cacheMapBbox(box: MapBbox, zoom: number): MapBbox {
  const padded = paddedMapBbox(box);
  const lat = (padded.minLat + padded.maxLat) / 2;
  const cell = clusterCellSize(zoom, lat);
  const pins = mapLoadMode(zoom, padded) === "pins";
  const stepLat = Math.max(pins ? 0.01 : cell.latDeg, 1e-4);
  const stepLng = Math.max(pins ? 0.01 : cell.lngDeg, 1e-4);
  const floor = (n: number, step: number) => Math.floor(n / step) * step;
  const ceil = (n: number, step: number) => Math.ceil(n / step) * step;
  return {
    minLat: floor(padded.minLat, stepLat),
    maxLat: ceil(padded.maxLat, stepLat),
    minLng: floor(padded.minLng, stepLng),
    maxLng: ceil(padded.maxLng, stepLng),
  };
}

export function mapViewCacheKey(box: MapBbox, zoom: number): string {
  const snapped = cacheMapBbox(box, zoom);
  const mode = mapLoadMode(zoom, snapped);
  return [
    mode,
    Math.round(clampMapZoom(zoom)),
    snapped.minLat.toFixed(4),
    snapped.maxLat.toFixed(4),
    snapped.minLng.toFixed(4),
    snapped.maxLng.toFixed(4),
  ].join(":");
}

/**
 * Skip a request when the last pin payload still covers this camera.
 * A closer city zoom can reuse dots already in hand. Area counts cannot:
 * zooming in, or panning out of the last box, loads that view's own pins.
 */
export function viewportNeedsFetch(input: {
  visible: MapBbox;
  zoom: number;
  loaded: { bbox: MapBbox; zoom: number; mode?: "clusters" | "pins" } | null;
}): boolean {
  const loaded = input.loaded;
  if (!loaded) return true;
  if (!bboxCovers(loaded.bbox, input.visible)) return true;
  const zoom = clampMapZoom(input.zoom);
  if (Math.round(loaded.zoom) === Math.round(zoom)) return false;
  const loadedMode = loaded.mode ?? mapLoadMode(loaded.zoom, loaded.bbox);
  if (loadedMode === "clusters") return true;
  return mapLoadMode(zoom, input.visible) !== "pins";
}

export function bboxCovers(outer: MapBbox, inner: MapBbox): boolean {
  return (
    outer.minLat <= inner.minLat &&
    outer.maxLat >= inner.maxLat &&
    outer.minLng <= inner.minLng &&
    outer.maxLng >= inner.maxLng
  );
}

export function sanitizeMapBbox(input: Partial<MapBbox> | null | undefined): MapBbox | null {
  if (!input) return null;
  const minLat = Number(input.minLat);
  const maxLat = Number(input.maxLat);
  const minLng = Number(input.minLng);
  const maxLng = Number(input.maxLng);
  if (![minLat, maxLat, minLng, maxLng].every((n) => Number.isFinite(n))) return null;
  const south = Math.min(minLat, maxLat);
  const north = Math.max(minLat, maxLat);
  const west = Math.min(minLng, maxLng);
  const east = Math.max(minLng, maxLng);
  if (north - south > 80 || east - west > 120) return null;
  if (north - south < 1e-6 || east - west < 1e-6) return null;
  return { minLat: south, maxLat: north, minLng: west, maxLng: east };
}

export function clusterStepZoom(cluster: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): boolean {
  return Math.abs(cluster.maxLat - cluster.minLat) < 0.004 && Math.abs(cluster.maxLng - cluster.minLng) < 0.004;
}

const clientCache = new Map<string, { at: number; data: MapViewData }>();

export function readMapViewCache(key: string, now = Date.now()): MapViewData | null {
  const hit = clientCache.get(key);
  if (!hit || now - hit.at > MAP_VIEW_CACHE_MS) {
    if (hit) clientCache.delete(key);
    return null;
  }
  return hit.data;
}

export function writeMapViewCache(key: string, data: MapViewData, now = Date.now()): void {
  clientCache.set(key, { at: now, data });
  if (clientCache.size > 40) {
    const oldest = clientCache.keys().next().value;
    if (typeof oldest === "string") clientCache.delete(oldest);
  }
}

export function resetMapViewCache(): void {
  clientCache.clear();
}
