import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  mapLoadMode,
  mapViewCacheKey,
  markerCount,
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

test("city zoom uses a smaller cell than the old 0.16 degree grid", () => {
  const cell = clusterCellSize(10, WINNIPEG.lat);
  assert.ok(cell.latDeg < 0.12, `cell ${cell.latDeg} is still city-sized`);
  assert.ok(cell.km > 3 && cell.km < 12);
  const far = clusterCellSize(6, WINNIPEG.lat);
  const near = clusterCellSize(14, WINNIPEG.lat);
  assert.ok(far.km > cell.km);
  assert.ok(near.km < cell.km);
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
  const clustered = projectMapRows(pins, 10, box);
  assert.equal(clustered.truncated, false);
  assert.equal(clustered.total, 500);
  assert.equal(clustered.mode, "clusters");
  if (clustered.mode === "clusters") assert.equal(clusterCountTotal(clustered.clusters), 500);

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
  assert.equal(mapLoadMode(16, box), "clusters");
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
  const fallback = markersForMapView({
    items: capped,
    view: null,
    zoom: 10,
    bounds: box,
    atLat: WINNIPEG.lat,
  });
  assert.equal(fallback.source, "search");
  assert.equal(markerCount(fallback.markers), SEARCH_LIST_CAP);
  const groups = fallback.markers.filter((marker) => marker.kind === "group");
  assert.ok(groups.length + (fallback.markers.length - groups.length) > 1);
  assert.ok(groups.length >= 4, "capped rows still spread across areas at city zoom");
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
  assert.equal(viewportNeedsFetch({ visible: nudged, zoom: 11, loaded: { bbox: snapped, zoom: 10 } }), true);
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
  assert.equal(view.mode, "clusters");
  assert.equal(view.total, within.length);
  if (view.mode !== "clusters") return;
  assert.equal(clusterCountTotal(view.clusters), within.length);
  assert.ok(view.clusters.length >= 8, `city zoom clusters: ${view.clusters.length}`);
  const biggest = Math.max(...view.clusters.map((cluster) => cluster.count));
  assert.ok(biggest < within.length / 2, `largest bubble ${biggest} of ${within.length}`);

  const areas = [
    "Winnipeg, MB",
    "Fort Garry, Winnipeg",
    "Transcona, Winnipeg",
    "Seven Oaks, Winnipeg",
    "St. Vital, Winnipeg",
  ].map(city);
  const nearest = areas.map((area) => {
    let best = view.clusters[0];
    let bestKm = Infinity;
    for (const cluster of view.clusters) {
      const km = haversineKm(area, cluster);
      if (km < bestKm) {
        best = cluster;
        bestKm = km;
      }
    }
    return { label: area.label, cluster: best, km: bestKm };
  });
  for (const hit of nearest) {
    assert.ok(hit.km < 6, `${hit.label} cluster is ${hit.km.toFixed(1)} km away`);
  }
  const ids = new Set(nearest.map((hit) => `${hit.cluster.lat.toFixed(4)},${hit.cluster.lng.toFixed(4)}`));
  assert.equal(ids.size, areas.length, "city zoom keeps a bubble per Winnipeg area");
  // St. Boniface sits about 2 km from downtown, so city zoom shares that bubble
  // instead of stacking two counts. One zoom step splits them.
  const boniface = city("St. Boniface, Winnipeg");
  const downtown = city("Winnipeg, MB");
  const closer = clusterMapPoints(within, 11, WINNIPEG.lat);
  const near = (area) => {
    let best = closer[0];
    let bestKm = Infinity;
    for (const cluster of closer) {
      const km = haversineKm(area, cluster);
      if (km < bestKm) {
        best = cluster;
        bestKm = km;
      }
    }
    return best;
  };
  const downtownCluster = near(downtown);
  const bonifaceCluster = near(boniface);
  assert.ok(haversineKm(downtownCluster, bonifaceCluster) > 1);

  const zoom10 = clusterMapPoints(within, 10, WINNIPEG.lat);
  const zoom12 = clusterMapPoints(within, 12, WINNIPEG.lat);
  const zoom15 = clusterMapPoints(within, 15, WINNIPEG.lat);
  assert.ok(zoom12.length > zoom10.length);
  assert.ok(zoom15.length > zoom12.length);
  assert.equal(clusterCountTotal(zoom10), within.length);
  assert.equal(clusterCountTotal(zoom15), within.length);
  const singles = zoom15.filter((cluster) => cluster.count === 1).length;
  assert.ok(singles > zoom15.length / 2);
});

test("Toronto, Edmonton, Vancouver, and Moncton keep area bubbles and full counts", async () => {
  for (const label of ["Toronto, ON", "Edmonton, AB", "Vancouver, BC", "Moncton, NB"]) {
    const origin = city(label);
    const loaded = await pins();
    const within = loaded.filter((pin) => haversineKm(origin, pin) <= 25);
    assert.ok(within.length > 20, `${label} has ${within.length} pins`);
    const view = projectMapRows(within, 10, boxAround(within));
    assert.equal(view.truncated, false);
    assert.equal(view.total, within.length);
    assert.equal(view.mode, "clusters");
    if (view.mode !== "clusters") continue;
    assert.equal(clusterCountTotal(view.clusters), within.length);
    assert.ok(view.clusters.length >= 4, `${label} city zoom clusters: ${view.clusters.length}`);
    const biggest = Math.max(...view.clusters.map((cluster) => cluster.count));
    assert.ok(biggest < within.length, `${label} is still one bubble`);
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

test("the map still waits on the Google Maps loader", () => {
  const view = read("src/components/map-view.tsx");
  const loader = read("src/lib/google-maps.ts");
  assert.match(view, /loadGoogleMaps\(/);
  assert.match(view, /loadAdvancedMarkerElement\(/);
  assert.match(view, /createKidEaseMap\(/);
  assert.match(view, /mapPinsInView/);
  assert.match(view, /MAP_FETCH_DEBOUNCE_MS/);
  assert.match(view, /ke-cluster-bubble/);
  assert.match(loader, /importLibrary\("marker"\)/);
  assert.match(loader, /MAP_VIEW_WAIT_MS/);
});
