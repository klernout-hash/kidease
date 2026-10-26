import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  localeSuggestsManitoba,
  originFromDeviceFix,
  originFromIpHint,
  parseCfColo,
  parseIpGeoHeaders,
  PRODUCT_HOME,
  resolveAnonymousOriginFromHeaders,
  resolveDefaultSearchOrigin,
  shouldRequestExploreGeolocation,
  trustedSavedOrigin,
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

const TORONTO_IP = {
  country: "CA",
  region: "ON",
  city: "Toronto",
  lat: 43.6532,
  lng: -79.3832,
};

const SAVED_TORONTO = { lat: 43.6532, lng: -79.3832, label: "Toronto, ON" };

/**
 * KidEase covers every province. A Canadian IP or GPS fix is a real place,
 * including Toronto. Winnipeg is never the fallback when location is unknown.
 */
describe("Canada-wide Explore never falls back to Winnipeg", () => {
  it("parses CF YYZ colo and Vercel America/Winnipeg timezone", () => {
    assert.equal(parseCfColo("8f3a2b1c0d9e8f7a-YYZ"), "YYZ");
    const hint = parseIpGeoHeaders(
      headers({
        "x-vercel-ip-country": "CA",
        "x-vercel-ip-country-region": "ON",
        "x-vercel-ip-city": "Toronto",
        "x-vercel-ip-latitude": "43.6532",
        "x-vercel-ip-longitude": "-79.3832",
        "x-vercel-ip-timezone": "America/Winnipeg",
        "cf-ray": "8f3a2b1c0d9e8f7a-YYZ",
      }),
    );
    assert.equal(hint?.timeZone, "America/Winnipeg");
    assert.equal(hint?.colo, "YYZ");
    assert.equal(hint?.city, "Toronto");
    assert.equal(localeSuggestsManitoba({ timeZone: hint.timeZone, ip: hint }), true);
    const origin = originFromIpHint(hint);
    assert.equal(origin.label, "Toronto, ON");
    assert.equal(origin.source, "ip");
    assert.notEqual(origin.label, WINNIPEG.label);
  });

  it("SSR Toronto + YYZ edge stays Toronto even if the clock header says Winnipeg", () => {
    const origin = resolveAnonymousOriginFromHeaders(
      headers({
        "cf-ipcountry": "CA",
        "cf-region-code": "ON",
        "cf-ipcity": "Toronto",
        "cf-iplatitude": "43.6532",
        "cf-iplongitude": "-79.3832",
        "cf-timezone": "America/Winnipeg",
        "cf-ray": "abc123-YYZ",
      }),
    );
    assert.equal(origin.label, "Toronto, ON");
    assert.equal(origin.source, "ip");
    assert.notEqual(origin.label, WINNIPEG.label);
  });

  it("keeps a saved Toronto origin and prefers granted Canadian GPS", () => {
    assert.equal(trustedSavedOrigin(SAVED_TORONTO, { timeZone: "America/Winnipeg" })?.label, "Toronto, ON");
    const resolved = resolveDefaultSearchOrigin({
      saved: SAVED_TORONTO,
      ip: TORONTO_IP,
      timeZone: "America/Winnipeg",
      gpsAllowed: true,
      gps: { lat: 43.6532, lng: -79.3832, accuracyM: 8_000 },
    });
    assert.match(resolved.label, /Toronto/);
    assert.equal(resolved.source, "gps");
  });

  it("keeps explicit typed/Places Toronto even if the clock is Winnipeg", () => {
    const resolved = resolveDefaultSearchOrigin({
      saved: { ...SAVED_TORONTO, explicit: true },
      timeZone: "America/Winnipeg",
    });
    assert.equal(resolved.source, "saved");
    assert.equal(resolved.label, "Toronto, ON");
  });

  it("keeps Canadian GPS, including a coarse Toronto fix", () => {
    const coarse = originFromDeviceFix(
      { lat: 43.6532, lng: -79.3832, accuracyM: 5_000 },
      PRODUCT_HOME,
      { timeZone: "America/Winnipeg" },
    );
    assert.match(coarse.label, /Toronto/);
    assert.equal(coarse.source, "gps");

    const street = originFromDeviceFix(
      { lat: 43.66, lng: -79.39, accuracyM: 25 },
      PRODUCT_HOME,
      { timeZone: "America/Winnipeg" },
    );
    assert.equal(street.source, "gps");
    assert.match(street.label, /Toronto/);
  });

  it("trusts Manitoba IP and a saved Winnipeg origin across visits", () => {
    const mb = resolveAnonymousOriginFromHeaders(
      headers({
        "x-vercel-ip-country": "CA",
        "x-vercel-ip-country-region": "MB",
        "x-vercel-ip-city": "Winnipeg",
        "x-vercel-ip-timezone": "America/Winnipeg",
      }),
    );
    assert.equal(mb.label, "Winnipeg, MB");
    assert.equal(mb.source, "ip");

    const saved = resolveDefaultSearchOrigin({
      saved: { lat: WINNIPEG.lat, lng: WINNIPEG.lng, label: WINNIPEG.label },
      timeZone: "America/Winnipeg",
    });
    assert.equal(saved.source, "saved");
    assert.equal(saved.label, WINNIPEG.label);
  });

  it("requests browser geolocation on Explore when consent is unset and nothing is saved", () => {
    assert.equal(trustedSavedOrigin(SAVED_TORONTO, { timeZone: "America/Winnipeg" })?.label, "Toronto, ON");
    assert.equal(
      shouldRequestExploreGeolocation({
        consent: "unset",
        savedTrusted: Boolean(trustedSavedOrigin(SAVED_TORONTO, { timeZone: "America/Winnipeg" })),
      }),
      false,
    );
    assert.equal(
      shouldRequestExploreGeolocation({
        consent: "unset",
        savedTrusted: false,
      }),
      true,
    );
    assert.equal(
      shouldRequestExploreGeolocation({
        consent: "unset",
        savedTrusted: true,
      }),
      false,
    );
    assert.equal(shouldRequestExploreGeolocation({ consent: "denied", savedTrusted: false }), false);
    assert.equal(shouldRequestExploreGeolocation({ consent: "granted", savedTrusted: true }), true);
  });

  it("wiring: persist only explicit choices, request GPS, drop inferred Toronto", () => {
    const boot = read("src/lib/search-origin.ts");
    const store = read("src/lib/store.ts");
    const search = read("src/routes/search.tsx");
    const native = read("src/components/native-boot.tsx");
    const geo = read("src/lib/geo.ts");
    assert.match(boot, /shouldRequestExploreGeolocation/);
    assert.match(boot, /getDeviceLocation/);
    assert.match(boot, /clearSavedOrigin/);
    assert.match(boot, /trustedSavedOrigin/);
    assert.match(boot, /readClientTimeZone/);
    assert.match(store, /explicit: source === "manual" \|\| source === "gps" \|\| origin.explicit === true/);
    assert.match(search, /explicit: true/);
    assert.match(search, /writeExploreSearch\(\{ q: place.label/);
    assert.match(native, /trustedSavedOrigin/);
    assert.match(native, /clearSavedOrigin/);
    assert.match(geo, /explicit: origin.explicit === true/);
    assert.doesNotMatch(boot, /gpsAllowed = consent === "granted"/);
  });
});
