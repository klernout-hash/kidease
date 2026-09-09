import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dismissPopovers, DISMISS_POPOVERS, placeHostVisible } from "../src/lib/dismiss-popovers.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("placeHostVisible rejects detached or zero-size hosts", () => {
  assert.equal(placeHostVisible(null), false);
  assert.equal(placeHostVisible(undefined), false);
});

test("dismissPopovers is a no-op without window", () => {
  assert.equal(DISMISS_POPOVERS, "kidease-dismiss-popovers");
  dismissPopovers();
});

test("Explore location suggestions dismiss on route, scroll, blur, menu, and view tabs", () => {
  const places = src("src/components/place-search.tsx");
  assert.match(places, /data-place-suggestions/);
  assert.match(places, /absolute left-0 right-0 top-\[calc\(100%/);
  assert.doesNotMatch(places, /createPortal/);
  assert.doesNotMatch(places, /fixed z-\[80\]/);
  assert.match(places, /useRouterState/);
  assert.match(places, /location\.pathname/);
  assert.match(places, /addEventListener\("scroll"/);
  assert.match(places, /addEventListener\("pointerdown"/);
  assert.match(places, /onBlur/);
  assert.match(places, /visualViewport/);
  assert.match(places, /IntersectionObserver/);
  assert.match(places, /placeHostVisible/);

  const drawer = src("src/components/nav-drawer.tsx");
  assert.match(drawer, /dismissPopovers\(\)/);

  const search = src("src/routes/search.tsx");
  assert.match(search, /dismissPopovers\(\)/);
  assert.match(search, /setView\("list"\)/);
  assert.match(search, /setView\("map"\)/);
  assert.match(search, /whitespace-nowrap/);
  assert.match(search, /basis-full/);
  assert.match(search, /CityHubLinks className="mt-3"/);

  const hubs = src("src/components/city-hub-links.tsx");
  assert.match(hubs, /overflow-x-auto/);
  assert.match(hubs, /flex-nowrap/);
  assert.match(hubs, /lg:flex-wrap/);
  assert.match(hubs, /shrink-0/);

  const css = src("src/styles.css");
  assert.match(css, /\.ke-chip \{[\s\S]*white-space: nowrap;/);
  assert.match(css, /\.ke-chip \{[\s\S]*text-overflow: ellipsis;/);
});
