import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CITIES, haversineKm, WINNIPEG } from "../src/lib/geo.ts";
import {
  MAP_FETCH_DEBOUNCE_MS,
  SEARCH_LIST_CAP,
  bboxCovers,
  cacheMapBbox,
  clusterAriaLabel,
  clusterBubblePx,
  clusterCellSize,
  clusterCountTotal,
  clusterMapPoints,
  collectPublicMapPins,
  groupingKm,
  MAP_DOT_HIT_PX,
  MAP_LOGO_PIN_ACTIVE_PX,
  MAP_LOGO_PIN_CITY_PX,
  MAP_LOGO_PIN_PX,
  MAP_TAP_SLOP_PX,
  decodeMapPinsWire,
  encodeMapPinWire,
  expandBboxByPx,
  mapBatchRetryDelayMs,
  mapCameraMoved,
  mapCameraSettleRequests,
  mapCanvasFrame,
  mapCanvasScreenOrigin,
  mapLoadMode,
  mapLogoPinPx,
  mapPinCanvasPoint,
  mapPinPlaceLine,
  mapPinTapPx,
  mapPointerIsTap,
  mapTileKey,
  mapTilesForCamera,
  mapSpanKm,
  runMapTileBatch,
  splitMapPinsByTile,
  mapViewCacheKey,
  markerCount,
  pickNearestMapDot,
  viewportNeedsFetch,
  markersForMapView,
  mergeMapClusters,
  projectMapRows,
  resetMapViewCache,
  writeMapViewCache,
  readMapViewCache,
} from "../src/lib/map-cluster.ts";
import { mapPinToCard } from "../src/lib/map-pin-card.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function cataloguePins() {
  const rows = JSON.parse(read("src/lib/data/centres.json"));
  return collectPublicMapPins(rows, {
    minLat: 41,
    maxLat: 72,
    minLng: -141,
    maxLng: -52,
  });
}

let cataloguePromise;
function pins() {
  cataloguePromise ??= Promise.resolve(cataloguePins());
  return cataloguePromise;
}

function city(label) {
  const hit = CITIES.find((row) => row.label === label);
  assert.ok(hit, label);
  return hit;
}

function radiusBox(origin, km) {
  const latDelta = km / 110.574;
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const lngDelta = km / (111.32 * Math.max(0.2, Math.abs(cos)));
  return {
    minLat: origin.lat - latDelta,
    maxLat: origin.lat + latDelta,
    minLng: origin.lng - lngDelta,
    maxLng: origin.lng + lngDelta,
  };
}

function boxAround(points) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  const pad = 0.02;
  return { minLat: minLat - pad, maxLat: maxLat + pad, minLng: minLng - pad, maxLng: maxLng + pad };
}

test("cluster bubble copy and size stay readable", () => {
  assert.equal(clusterAriaLabel(32), "32 daycares here, tap to zoom");
  assert.equal(clusterAriaLabel(1), "1 daycare here, tap to zoom");
  assert.equal(clusterAriaLabel(32, "fr"), "32 garderies ici, touchez pour zoomer");
  assert.equal(clusterAriaLabel(1, "fr"), "1 garderie ici, touchez pour zoomer");
  assert.ok(clusterBubblePx(4) < clusterBubblePx(40));
  assert.ok(clusterBubblePx(40) <= clusterBubblePx(400));
  assert.ok(clusterBubblePx(4000) <= 52);
  assert.ok(clusterBubblePx(4000) - clusterBubblePx(4) <= 16);
  assert.equal(MAP_FETCH_DEBOUNCE_MS >= 400, true);
});

test("city zoom draws pins; overlap bubbles wait until 40px is a short distance", () => {
  const city = clusterCellSize(10, WINNIPEG.lat);
  assert.ok(city.km > 2 && city.km < 6, `40px at zoom 10 is ${city.km.toFixed(2)} km`);
  assert.equal(groupingKm(10, WINNIPEG.lat), null);
  assert.equal(groupingKm(8, WINNIPEG.lat), null);
  const street = groupingKm(15, WINNIPEG.lat);
  assert.ok(street != null && street <= 0.45, `street overlap ${street}`);
  const province = groupingKm(6, WINNIPEG.lat);
  assert.ok(province > 40, `province cell ${province}`);
  assert.ok(clusterCellSize(6, WINNIPEG.lat).km > city.km);
  assert.ok(clusterCellSize(15, WINNIPEG.lat).km < city.km);
});

test("map queries do not apply the search list cap of 400", () => {
  const mapSql = read("src/lib/server/map-pins.ts");
  const listSql = read("src/lib/server/catalog-neon.ts");
  assert.match(listSql, /limit 400/);
  assert.doesNotMatch(mapSql, /limit\s+400/i);
  assert.match(mapSql, /MAP_PINS_SQL/);
  assert.match(mapSql, /MAP_CLUSTER_SQL/);
  assert.match(mapSql, /group by 1, 2/);
  assert.match(mapSql, /truncated: false/);
  assert.match(mapSql, /listRawMapPinsInBbox/);
  assert.match(read("src/lib/catalog.ts"), /collectPublicMapPins/);
  assert.doesNotMatch(read("src/lib/catalog.ts").slice(read("src/lib/catalog.ts").indexOf("listRawMapPinsInBbox")), /slice\(0,\s*400\)/);
  assert.equal(SEARCH_LIST_CAP, 400);

  const pins = Array.from({ length: 500 }, (_, index) => ({
    id: `id-${index}`,
    slug: `slug-${index}`,
    name: `Centre ${index}`,
    nameFr: "",
    lat: 49.8 + (index % 25) * 0.01,
    lng: -97.3 + Math.floor(index / 25) * 0.01,
    address: "",
    city: "Winnipeg",
    province: "MB",
    postalCode: "",
  }));
  const box = boxAround(pins);
  const spread = projectMapRows(pins, 10, box);
  assert.equal(spread.truncated, false);
  assert.equal(spread.total, 500);
  assert.equal(spread.mode, "pins");
  if (spread.mode === "pins") assert.equal(spread.pins.length, 500);

  const streetBox = {
    minLat: pins[0].lat - 0.01,
    maxLat: pins[0].lat + 0.01,
    minLng: pins[0].lng - 0.01,
    maxLng: pins[0].lng + 0.01,
  };
  const streetPins = pins.filter(
    (pin) =>
      pin.lat >= streetBox.minLat &&
      pin.lat <= streetBox.maxLat &&
      pin.lng >= streetBox.minLng &&
      pin.lng <= streetBox.maxLng,
  );
  const street = projectMapRows(streetPins, 16, streetBox);
  assert.equal(street.mode, "pins");
  assert.equal(street.truncated, false);
  if (street.mode === "pins") assert.equal(street.pins.length, streetPins.length);
  const province = { minLat: 49, maxLat: 52, minLng: -102, maxLng: -95 };
  assert.ok(mapSpanKm(province) > 160);
  assert.equal(mapLoadMode(16, province), "pins");
  assert.equal(mapLoadMode(10, box), "pins");
  assert.equal(mapLoadMode(9, province), "pins");
  assert.equal(mapLoadMode(6, box), "clusters");
});

test("viewport payload replaces a capped search list without dropping rows", () => {
  const pins = Array.from({ length: 460 }, (_, index) => ({
    id: `w-${index}`,
    slug: `w-${index}`,
    name: `Centre ${index}`,
    nameFr: "",
    lat: 49.75 + (index % 20) * 0.012,
    lng: -97.35 + Math.floor(index / 20) * 0.012,
    address: "1 Main St",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R3C 0A1",
  }));
  const box = boxAround(pins);
  const view = projectMapRows(pins, 10, box);
  const capped = pins.slice(0, SEARCH_LIST_CAP);
  const shown = markersForMapView({
    items: capped,
    view,
    zoom: 10,
    bounds: box,
    atLat: WINNIPEG.lat,
  });
  assert.equal(shown.source, "viewport");
  assert.equal(markerCount(shown.markers), 460);
  assert.equal(shown.markers.filter((marker) => marker.kind === "pin").length, 460);
  const fallback = markersForMapView({
    items: capped,
    view: null,
    zoom: 10,
    bounds: box,
    atLat: WINNIPEG.lat,
  });
  assert.equal(fallback.source, "viewport");
  assert.equal(fallback.markers.length, 0);
  const staleClusters = markersForMapView({
    items: capped,
    view: {
      mode: "clusters",
      clusters: [
        {
          lat: WINNIPEG.lat,
          lng: WINNIPEG.lng,
          count: 2781,
          minLat: box.minLat,
          maxLat: box.maxLat,
          minLng: box.minLng,
          maxLng: box.maxLng,
        },
      ],
      total: 2781,
      truncated: false,
      bbox: box,
      zoom: 11,
    },
    zoom: 12,
    bounds: box,
    atLat: WINNIPEG.lat,
  });
  assert.equal(staleClusters.markers.length, 0);
});

test("a small pan reuses the viewport cache", () => {
  resetMapViewCache();
  const box = radiusBox(WINNIPEG, 25);
  const snapped = cacheMapBbox(box, 10);
  assert.equal(bboxCovers(snapped, box), true);
  const nudged = {
    minLat: box.minLat + 0.01,
    maxLat: box.maxLat - 0.01,
    minLng: box.minLng + 0.01,
    maxLng: box.maxLng - 0.01,
  };
  assert.equal(viewportNeedsFetch({ visible: nudged, zoom: 10, loaded: { bbox: snapped, zoom: 10 } }), false);
  assert.equal(viewportNeedsFetch({ visible: nudged, zoom: 11, loaded: { bbox: snapped, zoom: 10 } }), false);
  assert.equal(viewportNeedsFetch({ visible: nudged, zoom: 6, loaded: { bbox: snapped, zoom: 10 } }), true);
  assert.equal(
    viewportNeedsFetch({
      visible: { minLat: snapped.maxLat + 0.2, maxLat: snapped.maxLat + 0.5, minLng: snapped.minLng, maxLng: snapped.minLng + 0.3 },
      zoom: 10,
      loaded: { bbox: snapped, zoom: 10 },
    }),
    true,
  );
  const key = mapViewCacheKey(box, 10);
  const view = projectMapRows([], 10, snapped);
  writeMapViewCache(key, view, 1_000);
  assert.equal(readMapViewCache(key, 1_000 + 1_000), view);
  assert.equal(readMapViewCache(key, 1_000 + 120_000), null);
  assert.equal(mapViewCacheKey(box, 10), key);
});

test("merging cluster cells keeps every listing", () => {
  const merged = mergeMapClusters(
    [
      { lat: 49.9, lng: -97.14, count: 10, minLat: 49.89, maxLat: 49.91, minLng: -97.15, maxLng: -97.13 },
      { lat: 49.901, lng: -97.141, count: 4, minLat: 49.9, maxLat: 49.902, minLng: -97.142, maxLng: -97.14 },
    ],
    2,
  );
  assert.equal(clusterCountTotal(merged), 14);
  assert.equal(merged.length, 1);
});

test("a viewport pin card does not invent fees, ages, or photos", () => {
  const card = mapPinToCard(
    {
      id: "mb-1",
      slug: "example-centre",
      name: "Example Centre",
      nameFr: "",
      lat: WINNIPEG.lat,
      lng: WINNIPEG.lng,
      address: "100 Main St",
      city: "Winnipeg",
      province: "MB",
      postalCode: "R3C 1A1",
    },
    WINNIPEG,
  );
  assert.equal(card.live, false);
  assert.equal(card.agesKnown, false);
  assert.equal(card.fromPrice, 0);
  assert.equal(card.infantMonthly, null);
  assert.deepEqual(card.photos, []);
  assert.equal(card.address, "100 Main St");
  assert.equal(card.distanceKm, 0);
});

test("Winnipeg city zoom spreads real catalogue pins and does not stop at 400", async () => {
  const loaded = await pins();
  const within = loaded.filter((pin) => haversineKm(WINNIPEG, pin) <= 25);
  assert.ok(
    within.length > SEARCH_LIST_CAP,
    `bundled public pins within 25 km of Winnipeg: ${within.length}`,
  );
  const box = boxAround(within);
  const view = projectMapRows(within, 10, box);
  assert.equal(view.truncated, false);
  assert.equal(view.mode, "pins");
  assert.equal(view.total, within.length);
  if (view.mode !== "pins") return;
  assert.equal(view.pins.length, within.length);

  const areas = [
    "Winnipeg, MB",
    "St. Boniface, Winnipeg",
    "Fort Garry, Winnipeg",
    "Transcona, Winnipeg",
    "Seven Oaks, Winnipeg",
    "St. Vital, Winnipeg",
  ].map(city);
  const nearest = areas.map((area) => {
    let best = view.pins[0];
    let bestKm = Infinity;
    for (const pin of view.pins) {
      const km = haversineKm(area, pin);
      if (km < bestKm) {
        best = pin;
        bestKm = km;
      }
    }
    return { label: area.label, pin: best, km: bestKm };
  });
  for (const hit of nearest) {
    assert.ok(hit.km < 6, `${hit.label} pin is ${hit.km.toFixed(1)} km away`);
  }
  const ids = new Set(nearest.map((hit) => hit.pin.slug));
  assert.equal(ids.size, areas.length, "city zoom keeps a pin in each Winnipeg area");

  const zoom10 = clusterMapPoints(within, 10, WINNIPEG.lat);
  const zoom15 = clusterMapPoints(within, 15, WINNIPEG.lat);
  assert.equal(zoom10.length, within.length);
  assert.equal(clusterCountTotal(zoom10), within.length);
  assert.equal(clusterCountTotal(zoom15), within.length);
  assert.ok(zoom15.length < zoom10.length, "street zoom groups only the pins that overlap");
  const singles = zoom15.filter((cluster) => cluster.count === 1).length;
  assert.ok(singles > zoom15.length / 2);
});

test("Toronto, Edmonton, Vancouver, and Moncton draw every pin at city zoom", async () => {
  for (const label of ["Toronto, ON", "Edmonton, AB", "Vancouver, BC", "Moncton, NB"]) {
    const origin = city(label);
    const loaded = await pins();
    const within = loaded.filter((pin) => haversineKm(origin, pin) <= 25);
    assert.ok(within.length > 20, `${label} has ${within.length} pins`);
    const view = projectMapRows(within, 10, boxAround(within));
    assert.equal(view.truncated, false);
    assert.equal(view.total, within.length);
    assert.equal(view.mode, "pins");
    if (view.mode !== "pins") continue;
    assert.equal(view.pins.length, within.length);
    const drawn = clusterMapPoints(within, 10, origin.lat);
    assert.equal(drawn.length, within.length, `${label} collapsed into bubbles at city zoom`);
  }
});

test("a provincial zoom keeps separate places instead of one bubble", async () => {
  const box = { minLat: 49.2, maxLat: 50.4, minLng: -101.2, maxLng: -95.8 };
  const loaded = (await pins()).filter(
    (pin) => pin.lat >= box.minLat && pin.lat <= box.maxLat && pin.lng >= box.minLng && pin.lng <= box.maxLng,
  );
  const view = projectMapRows(loaded, 6, box);
  assert.equal(view.truncated, false);
  assert.equal(view.total, loaded.length);
  assert.equal(view.mode, "clusters");
  if (view.mode !== "clusters") return;
  assert.equal(clusterCountTotal(view.clusters), loaded.length);
  assert.ok(view.clusters.length >= 3, `Manitoba zoom clusters: ${view.clusters.length}`);
  assert.ok(loaded.length > SEARCH_LIST_CAP);
});

const METERS_PER_PX_ZOOM0 = 156543.03392;

/** Visible camera for a map of widthPx by heightPx, centred on origin. */
function cameraBbox(origin, zoom, widthPx, heightPx) {
  const cos = Math.max(0.2, Math.abs(Math.cos((origin.lat * Math.PI) / 180)));
  const metersPerPx = (METERS_PER_PX_ZOOM0 * cos) / 2 ** zoom;
  const halfWKm = ((widthPx / 2) * metersPerPx) / 1000;
  const halfHKm = ((heightPx / 2) * metersPerPx) / 1000;
  return {
    minLat: origin.lat - halfHKm / 110.574,
    maxLat: origin.lat + halfHKm / 110.574,
    minLng: origin.lng - halfWKm / (111.32 * cos),
    maxLng: origin.lng + halfWKm / (111.32 * cos),
  };
}

/**
 * Zoom that fits a search circle in the map after the desktop radius padding.
 * Matches the live 1440×900 Winnipeg result: 25 km lands on zoom 9.
 */
function desktopFitZoom(origin, radiusKm, mapWidth, mapHeight) {
  const innerW = mapWidth - 64 - 16;
  const innerH = mapHeight - 72 - 28;
  const diameter = radiusKm * 2;
  for (let zoom = 18; zoom >= 3; zoom -= 1) {
    const box = cameraBbox(origin, zoom, innerW, innerH);
    const latKm = (box.maxLat - box.minLat) * 110.574;
    const cos = Math.max(0.2, Math.abs(Math.cos((origin.lat * Math.PI) / 180)));
    const lngKm = (box.maxLng - box.minLng) * 111.32 * cos;
    if (latKm >= diameter && lngKm >= diameter) return zoom;
  }
  return 3;
}

function pinsIn(loaded, box) {
  return loaded.filter(
    (pin) =>
      pin.lat >= box.minLat &&
      pin.lat <= box.maxLat &&
      pin.lng >= box.minLng &&
      pin.lng <= box.maxLng,
  );
}

test("a 1440x900 desktop keeps dots at the 25 km and 50 km Winnipeg fit", async () => {
  const loaded = await pins();
  const mapWidth = 1040;
  const mapHeight = 480;
  for (const radiusKm of [25, 50]) {
    const zoom = desktopFitZoom(WINNIPEG, radiusKm, mapWidth, mapHeight);
    const visible = cameraBbox(WINNIPEG, zoom, mapWidth, mapHeight);
    const snapped = cacheMapBbox(visible, zoom);
    assert.ok(mapSpanKm(snapped) > 160, `${radiusKm} km desktop fetch is ${mapSpanKm(snapped).toFixed(0)} km`);
    assert.equal(mapLoadMode(zoom, snapped), "pins", `zoom ${zoom} for ${radiusKm} km`);
    const inBox = pinsIn(loaded, snapped);
    const view = projectMapRows(inBox, zoom, snapped);
    assert.equal(view.mode, "pins");
    assert.equal(view.truncated, false);
    assert.equal(view.total, inBox.length);
    if (view.mode !== "pins") continue;
    assert.equal(view.pins.length, inBox.length);
    const drawn = clusterMapPoints(inBox, zoom, WINNIPEG.lat);
    assert.equal(drawn.length, inBox.length, `${radiusKm} km desktop drew bubbles`);
    assert.ok(inBox.length > SEARCH_LIST_CAP, `${radiusKm} km desktop has ${inBox.length} pins`);
  }
  assert.equal(desktopFitZoom(WINNIPEG, 25, mapWidth, mapHeight), 9);
});

test("Toronto zoom 11-13 stays dots and a North York pan loads its own pins", async () => {
  const toronto = city("Toronto, ON");
  const northYork = { lat: 43.7615, lng: -79.4111, label: "North York" };
  const loaded = await pins();
  const mapWidth = 1040;
  const mapHeight = 480;
  for (const zoom of [11, 12, 13]) {
    const visible = cameraBbox(toronto, zoom, mapWidth, mapHeight);
    const snapped = cacheMapBbox(visible, zoom);
    assert.equal(mapLoadMode(zoom, snapped), "pins");
    const inBox = pinsIn(loaded, snapped);
    const view = projectMapRows(inBox, zoom, snapped);
    assert.equal(view.mode, "pins", `zoom ${zoom} mode`);
    assert.equal(view.total, inBox.length);
    assert.ok(inBox.length > SEARCH_LIST_CAP, `Toronto zoom ${zoom} has ${inBox.length} pins`);
    const drawn = clusterMapPoints(inBox, zoom, toronto.lat);
    assert.equal(drawn.length, inBox.length, `Toronto zoom ${zoom} collapsed`);
    const shown = markersForMapView({
      items: inBox.slice(0, SEARCH_LIST_CAP),
      view,
      zoom,
      bounds: visible,
      atLat: toronto.lat,
    });
    assert.equal(markerCount(shown.markers), inBox.length);
    assert.equal(shown.markers.some((marker) => marker.kind === "group"), false);
  }

  const zoom11 = cacheMapBbox(cameraBbox(toronto, 11, mapWidth, mapHeight), 11);
  const zoom12 = cameraBbox(toronto, 12, mapWidth, mapHeight);
  assert.equal(bboxCovers(zoom11, zoom12), true);
  assert.equal(
    viewportNeedsFetch({
      visible: zoom12,
      zoom: 12,
      loaded: { bbox: zoom11, zoom: 11, mode: "clusters" },
    }),
    true,
  );
  assert.equal(
    viewportNeedsFetch({
      visible: zoom12,
      zoom: 12,
      loaded: { bbox: zoom11, zoom: 11, mode: "pins" },
    }),
    false,
  );

  const downtown = cacheMapBbox(cameraBbox(toronto, 13, mapWidth, mapHeight), 13);
  const northVisible = cameraBbox(northYork, 13, mapWidth, mapHeight);
  assert.equal(
    viewportNeedsFetch({
      visible: northVisible,
      zoom: 13,
      loaded: { bbox: downtown, zoom: 13, mode: "pins" },
    }),
    true,
  );
  const northSnapped = cacheMapBbox(northVisible, 13);
  const northPins = pinsIn(loaded, northSnapped);
  const northView = projectMapRows(northPins, 13, northSnapped);
  assert.equal(northView.mode, "pins");
  assert.ok(northPins.length > 0, "North York viewport has pins");
  assert.ok(northPins.some((pin) => haversineKm(northYork, pin) <= 8));
  const cappedDowntown = loaded
    .filter((pin) => haversineKm(toronto, pin) <= 25)
    .sort((a, b) => haversineKm(toronto, a) - haversineKm(toronto, b))
    .slice(0, SEARCH_LIST_CAP);
  assert.equal(
    cappedDowntown.some((pin) => haversineKm(northYork, pin) <= 4),
    false,
  );
});

test("overlapping dots pick the nearest centre", () => {
  const pins = [
    { slug: "far" },
    { slug: "near" },
  ];
  const hit = pickNearestMapDot(pins, [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ], { x: 8, y: 0 });
  assert.equal(hit?.slug, "near");
  assert.equal(
    pickNearestMapDot(pins, [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ], { x: 8, y: 0 })?.slug,
    "far",
  );
  assert.equal(pickNearestMapDot(pins, [{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 80, y: 0 }), null);
});

test("a city-zoom payload over 2500 pins stays individual dots", () => {
  const pins = Array.from({ length: 3000 }, (_, index) => ({
    id: `t-${index}`,
    slug: `t-${index}`,
    name: `Centre ${index}`,
    nameFr: "",
    lat: 43.6 + (index % 60) * 0.004,
    lng: -79.6 + Math.floor(index / 60) * 0.004,
    address: "",
    city: "Toronto",
    province: "ON",
    postalCode: "",
  }));
  const box = boxAround(pins);
  const view = projectMapRows(pins, 11, box);
  assert.equal(view.mode, "pins");
  assert.equal(view.total, 3000);
  if (view.mode === "pins") assert.equal(view.pins.length, 3000);
  const drawn = clusterMapPoints(pins, 11, 43.65);
  assert.equal(drawn.length, 3000);
  assert.equal(drawn.some((cell) => cell.count > 1), false);
});

test("a drag does not open a popup and a tap still uses the nearest centre", () => {
  assert.equal(mapPointerIsTap({ movedPx: 0, cameraMoved: false }), true);
  assert.equal(mapPointerIsTap({ movedPx: MAP_TAP_SLOP_PX, cameraMoved: false }), true);
  assert.equal(mapPointerIsTap({ movedPx: MAP_TAP_SLOP_PX + 1, cameraMoved: false }), false);
  assert.equal(mapPointerIsTap({ movedPx: 40, cameraMoved: false }), false);
  assert.equal(mapPointerIsTap({ movedPx: 0, cameraMoved: true }), false);
  assert.equal(mapPointerIsTap({ movedPx: 2, cameraMoved: true }), false);
  assert.equal(
    mapCameraMoved({ lat: 43.7, lng: -79.4, zoom: 11 }, { lat: 43.7, lng: -79.4, zoom: 11 }),
    false,
  );
  assert.equal(
    mapCameraMoved({ lat: 43.7, lng: -79.4, zoom: 11 }, { lat: 43.72, lng: -79.4, zoom: 11 }),
    true,
  );
  assert.equal(
    mapCameraMoved({ lat: 43.7, lng: -79.4, zoom: 11 }, { lat: 43.7, lng: -79.4, zoom: 12 }),
    true,
  );
  const pins = [
    { slug: "angus", name: "Angus Valley Montessori" },
    { slug: "yonge", name: "The Neighbourhood Group Yonge And Sheppard" },
  ];
  const centers = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ];
  assert.equal(pickNearestMapDot(pins, centers, { x: 2, y: 1 })?.slug, "angus");
  assert.equal(pickNearestMapDot(pins, centers, { x: 24, y: 0 })?.slug, "yonge");
  const dragged = mapPointerIsTap({ movedPx: 36, cameraMoved: true });
  assert.equal(dragged, false);
  const view = read("src/components/map-view.tsx");
  assert.match(view, /if \(event\.detail === 0\) return/);
  assert.match(view, /event\.stopPropagation\(\)/);
  assert.match(view, /mapPointerIsTap\(\{ movedPx, cameraMoved \}\)/);
  assert.match(view, /event\.key === "Enter" \|\| event\.key === " "/);
});

function fullPinJson(pin) {
  return JSON.stringify({
    id: pin.id,
    slug: pin.slug,
    name: pin.name,
    nameFr: pin.nameFr,
    lat: pin.lat,
    lng: pin.lng,
    address: pin.address,
    city: pin.city,
    province: pin.province,
    postalCode: pin.postalCode,
  });
}

test("viewport tiles stay individual pins and the wire payload is much smaller", async () => {
  const loaded = await pins();
  const toronto = city("Toronto, ON");
  const scenes = [
    { label: "Toronto desktop", origin: toronto, zoom: 9, width: 1200, height: 544 },
    { label: "Toronto phone", origin: toronto, zoom: 9, width: 366, height: 576 },
    { label: "Winnipeg desktop", origin: WINNIPEG, zoom: 9, width: 1200, height: 544 },
    { label: "Winnipeg phone", origin: WINNIPEG, zoom: 9, width: 366, height: 576 },
  ];
  const mapSql = read("src/lib/server/map-pins.ts");
  assert.match(mapSql, /select id, lat, lng, name/);
  assert.match(mapSql, /MAP_PIN_DETAIL_SQL/);
  assert.doesNotMatch(mapSql, /limit\s+400/i);
  for (const scene of scenes) {
    const visible = cameraBbox(scene.origin, scene.zoom, scene.width, scene.height);
    const tiles = mapTilesForCamera(visible, scene.zoom, scene.width, scene.height);
    assert.ok(tiles.length >= 1 && tiles.length <= 24, `${scene.label} tiles ${tiles.length}`);
    for (const tile of tiles) assert.equal(mapLoadMode(scene.zoom, tile), "pins");
    const padded = cacheMapBbox(visible, scene.zoom);
    assert.ok(mapSpanKm(tiles[0]) < mapSpanKm(padded), `${scene.label} tile is smaller than the padded box`);
    const draw = expandBboxByPx(visible, scene.zoom, 64);
    const inView = pinsIn(loaded, draw);
    const fromTiles = [];
    const seen = new Set();
    for (const tile of tiles) {
      for (const pin of pinsIn(loaded, tile)) {
        if (seen.has(pin.id) || !pointInside(pin, draw)) continue;
        seen.add(pin.id);
        fromTiles.push(pin);
      }
    }
    for (const pin of inView) {
      assert.equal(seen.has(pin.id), true, `${scene.label} missed ${pin.name}`);
    }
    assert.ok(fromTiles.length > SEARCH_LIST_CAP || scene.label.startsWith("Winnipeg"), scene.label);
    const full = Buffer.from(`[${inView.map(fullPinJson).join(",")}]`);
    const wire = Buffer.from(JSON.stringify(inView.map(encodeMapPinWire)));
    const wireBack = decodeMapPinsWire(JSON.parse(wire.toString("utf8")));
    assert.equal(wireBack.length, inView.length);
    assert.equal(wireBack[0]?.name, inView[0]?.name);
    const fullGzip = gzipSync(full).length;
    const wireGzip = gzipSync(wire).length;
    const wireBrotli = brotliCompressSync(wire, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
    }).length;
    assert.ok(wire.length < full.length / 2, `${scene.label} wire ${wire.length} vs full ${full.length}`);
    assert.ok(wireGzip < fullGzip, `${scene.label} gzip`);
    console.log(
      `${scene.label} pins ${inView.length} tiles ${tiles.length} full ${full.length} wire ${wire.length} gzip ${wireGzip} brotli ${wireBrotli} fullGzip ${fullGzip}`,
    );
  }
});

test("the pin canvas is anchored on the map top-left so every quadrant paints and hits", () => {
  const width = 1040;
  const height = 476;
  const mapLeft = 200;
  const mapTop = 225;
  const uncorrected = mapCanvasFrame({ width, height, northWest: { x: 0, y: 0 } });
  const shifted = mapCanvasScreenOrigin({
    mapLeft,
    mapTop,
    width,
    height,
    frame: uncorrected,
  });
  assert.equal(shifted.left, 720);
  assert.equal(shifted.top, 463);

  const frame = mapCanvasFrame({
    width,
    height,
    northWest: { x: -width / 2, y: -height / 2 },
  });
  const screen = mapCanvasScreenOrigin({ mapLeft, mapTop, width, height, frame });
  assert.equal(frame.originX, -width / 2);
  assert.equal(frame.originY, -height / 2);
  assert.equal(screen.left, mapLeft);
  assert.equal(screen.top, mapTop);

  const fallback = mapCanvasFrame({ width, height, northWest: null });
  assert.deepEqual(fallback, frame);

  const quadrants = [
    { id: "nw", x: -300, y: -120 },
    { id: "ne", x: 280, y: -140 },
    { id: "sw", x: -260, y: 150 },
    { id: "se", x: 240, y: 160 },
  ];
  const centers = quadrants.map((pin) => mapPinCanvasPoint(pin, frame));
  for (const center of centers) {
    assert.ok(center.x >= 0 && center.x <= width, `x ${center.x}`);
    assert.ok(center.y >= 0 && center.y <= height, `y ${center.y}`);
  }
  const pins = quadrants.map((pin) => ({ id: pin.id, name: pin.id }));
  const topLeft = pickNearestMapDot(pins, centers, centers[0], 16);
  assert.equal(topLeft?.id, "nw");
  assert.equal(pickNearestMapDot(pins, centers, { x: quadrants[0].x, y: quadrants[0].y }, 16), null);
  for (const center of centers) {
    const hit = pickNearestMapDot(pins, centers, center, 16);
    assert.equal(hit?.id, pins[centers.indexOf(center)].id);
  }
});

test("a camera settle batches every missing tile into one request and retries a 429", async () => {
  const visible = { minLat: 49.7, maxLat: 49.95, minLng: -97.35, maxLng: -96.95 };
  const tiles = mapTilesForCamera(visible, 9, 1040, 476);
  assert.ok(tiles.length > 1 && tiles.length <= 24);
  assert.equal(mapCameraSettleRequests(tiles.length), 1);
  assert.equal(mapCameraSettleRequests(0), 0);

  const pin = { id: "nw-pin", lat: (tiles[0].minLat + tiles[0].maxLat) / 2, lng: (tiles[0].minLng + tiles[0].maxLng) / 2 };
  const split = splitMapPinsByTile([pin], tiles, 9);
  assert.equal(split.length, tiles.length);
  assert.equal(split.filter((tile) => tile.pins.some((row) => row.id === pin.id)).length, 1);
  assert.equal(split[0].key, mapTileKey(tiles[0], 9));

  let calls = 0;
  const waits = [];
  const loaded = await runMapTileBatch({
    load: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("Too many requests");
        error.status = 429;
        error.retryAfterSec = 1;
        throw error;
      }
      return { tiles: split };
    },
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
  assert.equal(loaded.tiles.length, tiles.length);
  assert.equal(mapBatchRetryDelayMs({ status: 500 }, 0), null);
  assert.equal(mapBatchRetryDelayMs({ status: 429 }, 3), null);
  assert.equal(mapBatchRetryDelayMs(new Error("Too many requests"), 1), 1000);

  const view = read("src/components/map-view.tsx");
  const server = read("src/lib/server/map-pins.ts");
  assert.match(view, /mapPinTiles\(\{ data: \{ zoom: zoomNow, tiles: missing \} \}\)/);
  assert.match(view, /MAP_FETCH_DEBOUNCE_MS/);
  assert.match(server, /loadMapPinTileBatch/);
  assert.match(server, /unionMapTiles/);
  assert.doesNotMatch(view, /exact: true/);
});

test("the tap popup shows a street address when the centre has one", () => {
  assert.equal(
    mapPinPlaceLine({ address: "123 Main St", city: "Winnipeg", away: "2 km" }),
    "123 Main St · Winnipeg · 2 km",
  );
  assert.equal(mapPinPlaceLine({ address: "", city: "Winnipeg", away: "2 km" }), "Winnipeg · 2 km");
  assert.equal(
    mapPinPlaceLine({ address: "123 Main St, Winnipeg", city: "Winnipeg", away: "2 km" }),
    "123 Main St, Winnipeg · 2 km",
  );
  const view = read("src/components/map-view.tsx");
  assert.match(view, /mapPinPlaceLine/);
  assert.doesNotMatch(view, /item\.city \|\| displayListingText\(item\.address\)/);
});

function pointInside(pin, box) {
  return pin.lat >= box.minLat && pin.lat <= box.maxLat && pin.lng >= box.minLng && pin.lng <= box.maxLng;
}

test("logo pins are smaller at the radius-fit zoom and full size from zoom 12", () => {
  assert.equal(mapLogoPinPx(8), MAP_LOGO_PIN_CITY_PX);
  assert.equal(mapLogoPinPx(9), 24);
  assert.equal(mapLogoPinPx(11), 24);
  assert.equal(mapLogoPinPx(12), MAP_LOGO_PIN_PX);
  assert.equal(mapLogoPinPx(13), 36);
  assert.equal(mapPinTapPx(9), 28);
  assert.equal(mapPinTapPx(9) / 2, MAP_DOT_HIT_PX);
  assert.equal(mapPinTapPx(12), 36);
  assert.equal(MAP_LOGO_PIN_ACTIVE_PX, 44);
  const view = read("src/components/map-view.tsx");
  const css = read("src/styles.css");
  assert.match(view, /aria-label", pinLabel/);
  assert.match(view, /LOGO_PIN_URL/);
  assert.match(view, /drawImage/);
  assert.equal(view.split("PIN_SVG").length > 2, true);
  assert.doesNotMatch(css, /\.ke-map-dot \{/);
  assert.match(css, /\.ke-map-pin-canvas/);
  assert.match(css, /\.ke-logo-pin\.is-active svg \{\s*width: 44px;/);
  assert.match(css, /\.ke-cluster-bubble/);
});

test("the map still waits on the Google Maps loader", () => {
  const view = read("src/components/map-view.tsx");
  const loader = read("src/lib/google-maps.ts");
  assert.match(view, /loadGoogleMaps\(/);
  assert.match(view, /loadAdvancedMarkerElement\(/);
  assert.match(view, /createKidEaseMap\(/);
  assert.match(view, /mapPinsInView/);
  assert.match(view, /MAP_FETCH_DEBOUNCE_MS/);
  assert.match(view, /ke-cluster-bubble/);
  assert.match(view, /ke-map-pin-canvas/);
  assert.match(view, /LOGO_PIN_URL/);
  assert.match(view, /mapLogoPinPx/);
  assert.match(view, /mapPointerIsTap/);
  assert.match(view, /event\.detail === 0/);
  assert.match(view, /mapTilesForCamera/);
  assert.match(view, /mapPinTiles/);
  assert.match(view, /mapCanvasFrame/);
  assert.match(view, /runMapTileBatch/);
  assert.doesNotMatch(view, /worker\(\), worker\(\), worker\(\)/);
  assert.match(view, /ke-logo-pin is-active/);
  assert.doesNotMatch(view, /className = "ke-map-dot"/);
  assert.match(view, /ke-logo-pin/);
  assert.match(loader, /importLibrary\("marker"\)/);
  assert.match(loader, /MAP_VIEW_WAIT_MS/);
});
