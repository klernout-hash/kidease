import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isCoarseFix,
  isTrustedAnonymousIp,
  isUntrustedAnonymousToronto,
  originFromDeviceFix,
  originFromIpHint,
  parseIpGeoHeaders,
  placesBiasOrigin,
  PRODUCT_HOME,
  resolveAnonymousOriginFromHeaders,
  resolveDefaultSearchOrigin,
} from "../src/lib/default-origin.ts";
import { WINNIPEG } from "../src/lib/geo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function headers(map) {
  return {
    get(name) {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

describe("anonymous default origin prefers Winnipeg when geo is missing or wrong", () => {
  it("falls back to Winnipeg with no headers", () => {
    const origin = resolveAnonymousOriginFromHeaders(null);
    assert.equal(origin.label, WINNIPEG.label);
    assert.equal(origin.source, "default");
    assert.equal(origin.lat, WINNIPEG.lat);
  });

  it("treats inferred Toronto IP as the untrusted Canada default", () => {
    const hint = parseIpGeoHeaders(
      headers({
        "x-vercel-ip-country": "CA",
        "x-vercel-ip-country-region": "ON",
        "x-vercel-ip-city": "Toronto",
        "x-vercel-ip-latitude": "43.6532",
        "x-vercel-ip-longitude": "-79.3832",
      }),
    );
    assert.equal(isUntrustedAnonymousToronto(hint), true);
    assert.equal(isTrustedAnonymousIp(hint), false);
    const origin = originFromIpHint(hint);
    assert.equal(origin.label, WINNIPEG.label);
    assert.equal(origin.source, "default");
  });

  it("treats Ontario-only IP (no city) as untrusted", () => {
    const origin = resolveAnonymousOriginFromHeaders(
      headers({
        "cf-ipcountry": "CA",
        "cf-region-code": "ON",
      }),
    );
    assert.equal(origin.label, WINNIPEG.label);
  });

  it("trusts Manitoba IP and other specific Canadian cities", () => {
    const mb = resolveAnonymousOriginFromHeaders(
      headers({
        "x-vercel-ip-country": "CA",
        "x-vercel-ip-country-region": "MB",
        "x-vercel-ip-city": "Brandon",
      }),
    );
    assert.equal(mb.label, "Brandon, MB");
    assert.equal(mb.source, "ip");

    const van = resolveAnonymousOriginFromHeaders(
      headers({
        "cf-ipcountry": "CA",
        "cf-region-code": "BC",
        "cf-ipcity": "Vancouver",
        "cf-iplatitude": "49.2827",
        "cf-iplongitude": "-123.1207",
      }),
    );
    assert.equal(van.label, "Vancouver, BC");
    assert.equal(van.source, "ip");
  });

  it("rejects non-Canada IP", () => {
    const origin = resolveAnonymousOriginFromHeaders(
      headers({
        "x-vercel-ip-country": "US",
        "x-vercel-ip-city": "Chicago",
      }),
    );
    assert.equal(origin.label, WINNIPEG.label);
  });
});

describe("GPS and saved origin still allow multi-city search", () => {
  it("uses precise GPS in Toronto when permitted", () => {
    const resolved = resolveDefaultSearchOrigin({
      gpsAllowed: true,
      gps: { lat: 43.66, lng: -79.39, accuracyM: 25 },
    });
    assert.equal(resolved.source, "gps");
    assert.ok(Math.abs(resolved.lat - 43.66) < 0.001);
    assert.match(resolved.label, /Toronto/);
  });

  it("does not let coarse Toronto GPS replace Winnipeg", () => {
    assert.equal(isCoarseFix({ accuracyM: 40_000 }), true);
    const resolved = resolveDefaultSearchOrigin({
      gpsAllowed: true,
      gps: { lat: 43.6532, lng: -79.3832, accuracyM: 40_000 },
    });
    assert.equal(resolved.label, WINNIPEG.label);
    assert.equal(resolved.source, "default");
  });

  it("keeps a saved Toronto origin the parent already chose", () => {
    const resolved = resolveDefaultSearchOrigin({
      saved: { lat: 43.6532, lng: -79.3832, label: "Toronto, ON" },
      ip: {
        country: "CA",
        region: "ON",
        city: "Toronto",
        lat: 43.6532,
        lng: -79.3832,
      },
    });
    assert.equal(resolved.source, "saved");
    assert.equal(resolved.label, "Toronto, ON");
  });

  it("originFromDeviceFix maps coarse Toronto to the product home", () => {
    const resolved = originFromDeviceFix({ lat: 43.65, lng: -79.38, accuracyM: 80_000 });
    assert.equal(resolved.label, PRODUCT_HOME.label);
    assert.equal(resolved.source, "default");
  });

  it("Places bias defaults to Winnipeg and keeps a Canadian origin", () => {
    assert.equal(placesBiasOrigin().lat, WINNIPEG.lat);
    assert.equal(placesBiasOrigin({ lat: 51.0447, lng: -114.0719 }).lng, -114.0719);
    assert.equal(placesBiasOrigin({ lat: 40.7128, lng: -74.006 }).lat, WINNIPEG.lat);
  });
});

describe("wiring keeps explicit search and documents the fallback", () => {
  it("search and home SSR loaders use the request-origin helper", () => {
    const search = read("src/routes/search.tsx");
    const home = read("src/routes/index.tsx");
    const boot = read("src/lib/search-origin.ts");
    assert.match(search, /resolveRequestSearchOrigin/);
    assert.match(search, /bootSearchOrigin\(incoming\.q, boot\.origin\)/);
    assert.match(home, /resolveRequestSearchOrigin/);
    assert.match(boot, /incomingQ/);
    assert.match(boot, /resolveLocationQuery/);
    assert.match(boot, /resolveDefaultSearchOrigin/);
    assert.doesNotMatch(boot, /setOrigin\(WINNIPEG\)/);
  });

  it("Places stays Canada-biased without hard-bounding other cities", () => {
    const places = read("src/lib/server/google-places.ts");
    assert.match(places, /country:ca/);
    assert.match(places, /placesBiasOrigin/);
    assert.match(places, /region: "ca"/);
    assert.doesNotMatch(places, /strictbounds/);
    assert.doesNotMatch(places, /country:us/);
  });

  it("default origin is not written as a saved choice", () => {
    const store = read("src/lib/store.ts");
    assert.match(store, /source === "manual" \|\| source === "gps" \|\| source === "saved"/);
    assert.match(read("src/components/native-boot.tsx"), /resolveDefaultSearchOrigin/);
  });
});
