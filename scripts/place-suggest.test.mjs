import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isLocalPlaceId,
  localPlaceId,
  resolveLocalPlace,
  suggestLocalPlaces,
} from "../src/lib/place-suggest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("local place suggestions match Canadian cities without inventing streets", () => {
  const hits = suggestLocalPlaces("winn");
  assert.ok(hits.some((h) => h.label.startsWith("Winnipeg")));
  assert.ok(hits.every((h) => isLocalPlaceId(h.placeId)));
  const resolved = resolveLocalPlace(localPlaceId("Winnipeg, MB"));
  assert.equal(resolved?.label, "Winnipeg, MB");
  assert.ok(resolved && resolved.lat > 49 && resolved.lng < -97);
  assert.equal(suggestLocalPlaces("x").length, 0);
  assert.equal(resolveLocalPlace("ChIJxxxx"), null);
});

test("PlaceSearch portals suggestions and falls back when server Places is empty", () => {
  const places = src("src/components/place-search.tsx");
  assert.match(places, /createPortal/);
  assert.match(places, /data-place-suggestions/);
  assert.match(places, /suggestPlacesBrowser/);
  assert.match(places, /geocodeWithBrowser/);
  assert.match(places, /suggestLocalPlaces/);
  assert.match(places, /resolveLocationQuery/);
  assert.doesNotMatch(places, /contain-layout/);
  assert.match(src("src/components/dual-anchor-bar.tsx"), /anchorWorkMiss/);
  assert.match(src("src/lib/copy.ts"), /anchorWorkMiss: "We couldn’t find that address/);
  assert.match(src("src/lib/copy.ts"), /Adresse introuvable/);
});
