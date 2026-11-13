import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { resolveSearchCardOrigin } from "../src/lib/search-card-origin.ts";
import { honestCardDistance } from "../src/lib/plausible-distance.ts";
import { parentDistanceLabel } from "../src/lib/distance-label.ts";
import { haversineKm as distanceKm } from "../src/lib/geo.ts";

const neutral = Object.freeze({ lat: 63.1, lng: -96.2, label: "" });
const winnipeg = Object.freeze({ lat: 49.8951, lng: -97.1384, label: "Winnipeg, MB", source: "default" });
const toronto = Object.freeze({ lat: 43.6532, lng: -79.3832, label: "Toronto, ON" });
const input = Object.freeze({ storedOrigin: neutral, storedSource: null, bootOrigin: winnipeg });

test("server and first-hydration initial snapshots use the same request origin without mutating input", () => {
  const server = resolveSearchCardOrigin(input);
  const firstHydration = resolveSearchCardOrigin({ ...input, storedOrigin: { ...neutral } });
  assert.deepEqual(server, firstHydration);
  assert.deepEqual(server, { origin: winnipeg, source: "default" });
  assert.equal(input.storedOrigin, neutral);
  assert.equal(input.storedOrigin.label, "");
});

test("later GPS, manual and saved pins retain priority over request fallback", () => {
  for (const source of ["gps", "manual", "saved", "ip", "default", null]) {
    const result = resolveSearchCardOrigin({ ...input, storedOrigin: toronto, storedSource: source });
    assert.equal(result.origin, toronto);
    assert.equal(result.source, source);
  }
});

test("request source is preserved exactly rather than invented as a parent GPS/manual pin", () => {
  for (const source of ["ip", "default", "manual"]) {
    const boot = { ...winnipeg, source };
    assert.deepEqual(resolveSearchCardOrigin({ ...input, bootOrigin: boot }), { origin: boot, source });
  }
  assert.equal(resolveSearchCardOrigin({ ...input, bootOrigin: { ...winnipeg, source: "name-result" } }), null);
});

test("unknown/needs-place and malformed loader locations cannot invent geographic presentation", () => {
  for (const patch of [
    { unknownCity: true }, { needsPlace: true }, { bootOrigin: null },
    { bootOrigin: { ...winnipeg, label: " " } },
    { bootOrigin: { ...winnipeg, lat: NaN } },
    { bootOrigin: { ...winnipeg, lng: Infinity } },
    { bootOrigin: { ...winnipeg, lat: 91 } },
    { bootOrigin: { ...winnipeg, lng: -181 } },
    { bootOrigin: { ...winnipeg, lat: 0, lng: 0 } },
  ]) assert.equal(resolveSearchCardOrigin({ ...input, ...patch }), null);
  // A real existing browser pin is retained even on an unknown name/city route.
  assert.equal(resolveSearchCardOrigin({ ...input, storedOrigin: toronto, storedSource: "saved", unknownCity: true }).origin, toronto);
});

test("invalid stored coordinates do not displace a valid request pin", () => {
  for (const storedOrigin of [{ ...toronto, lat: NaN }, { ...toronto, lng: 181 }, { ...toronto, label: "" }])
    assert.equal(resolveSearchCardOrigin({ ...input, storedOrigin }).origin, winnipeg);
});

// Render the real context TSX with React; there is no mocked context implementation.
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../src/components/search-card-context.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const contextModule = { exports: {} };
new Function("require", "module", "exports", source)(require, contextModule, contextModule.exports);
const { SearchCardOriginProvider, useSearchCardOrigin } = contextModule.exports;

function Distance({ storedOrigin = neutral, storedSource = null, locale = "en", city = "Winnipeg" }) {
  const request = useSearchCardOrigin();
  const origin = request?.origin ?? storedOrigin;
  const originSource = request ? request.source : storedSource;
  const centre = city === "Toronto" ? { lat: toronto.lat + .0027, lng: toronto.lng } : { lat: winnipeg.lat + .0027, lng: winnipeg.lng };
  const km = distanceKm(origin, centre);
  const show = honestCardDistance({ km, originLabel: origin.label, originSource, listingCity: city });
  return createElement("span", null, parentDistanceLabel({ km, show, away: locale === "fr" ? "km" : "km away" }));
}

test("real React SSR renders the request's accurate distance in EN/FR without geographic store state", () => {
  for (const locale of ["en", "fr"]) {
    const html = renderToStaticMarkup(createElement(SearchCardOriginProvider, { value: resolveSearchCardOrigin(input) }, createElement(Distance, { locale })));
    assert.equal(html, `<span>0.3 ${locale === "fr" ? "km" : "km away"}</span>`);
  }
});

test("request providers remain isolated and cards outside a search provider retain their own store pin", () => {
  const render = (value, props) => renderToStaticMarkup(createElement(SearchCardOriginProvider, { value }, createElement(Distance, props)));
  assert.equal(render(resolveSearchCardOrigin(input)), "<span>0.3 km away</span>");
  assert.equal(render(resolveSearchCardOrigin({ ...input, bootOrigin: { ...toronto, source: "ip" } }), { city: "Toronto" }), "<span>0.3 km away</span>");
  assert.equal(render(resolveSearchCardOrigin(input)), "<span>0.3 km away</span>");
  assert.equal(renderToStaticMarkup(createElement(Distance)), "<span></span>");
  assert.equal(renderToStaticMarkup(createElement(Distance, { storedOrigin: toronto, storedSource: "saved", city: "Toronto" })), "<span>0.3 km away</span>");
});

test("real Zustand SSR initial snapshot stays request-scoped even if a different current pin exists", () => {
  const store = createStore(() => ({ origin: neutral, source: null }));
  store.setState({ origin: toronto, source: "saved" });
  function RequestBoundary() {
    const storedOrigin = useStore(store, (state) => state.origin);
    const storedSource = useStore(store, (state) => state.source);
    return createElement(SearchCardOriginProvider, { value: resolveSearchCardOrigin({ ...input, storedOrigin, storedSource }) }, createElement(Distance));
  }
  assert.equal(renderToStaticMarkup(createElement(RequestBoundary)), "<span>0.3 km away</span>");
  assert.equal(store.getState().origin, toronto);
  assert.equal(store.getInitialState().origin, neutral);
});
