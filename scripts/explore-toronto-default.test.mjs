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
 * Kyle in Winnipeg: Explore must not land on Toronto from CDN / stale
 * kidease-origin / IP-class geolocation. Repro: America/Winnipeg + inferred
 * Toronto from Vercel/CF or localStorage without explicit: true.
 */
describe("Kyle Winnipeg: never default Explore to Toronto", () => {
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
    assert.equal(origin.label, WINNIPEG.label);
    assert.equal(origin.source, "default");
  });

  it("SSR Toronto + YYZ edge + Winnipeg timezone still falls back to Winnipeg", () => {
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
    assert.equal(origin.label, WINNIPEG.label);
    assert.notEqual(origin.label, "Toronto, ON");
  });

  it("discards stale localStorage Toronto when timezone is America/Winnipeg", () => {
    assert.equal(trustedSavedOrigin(SAVED_TORONTO, { timeZone: "America/Winnipeg" }), null);
    const resolved = resolveDefaultSearchOrigin({
      saved: SAVED_TORONTO,
      ip: TORONTO_IP,
      timeZone: "America/Winnipeg",
      gpsAllowed: true,
      gps: { lat: 43.6532, lng: -79.3832, accuracyM: 8_000 },
    });
    assert.equal(resolved.label, WINNIPEG.label);
    assert.equal(resolved.source, "default");
  });

  it("keeps explicit typed/Places Toronto even if the clock is Winnipeg", () => {
    const resolved = resolveDefaultSearchOrigin({
      saved: { ...SAVED_TORONTO, explicit: true },
      timeZone: "America/Winnipeg",
    });
    assert.equal(resolved.source, "saved");
    assert.equal(resolved.label, "Toronto, ON");
  });

  it("rejects laptop/IP GPS that pins Toronto while the locale is Manitoba", () => {
    const coarse = originFromDeviceFix(
      { lat: 43.6532, lng: -79.3832, accuracyM: 5_000 },
      PRODUCT_HOME,
      { timeZone: "America/Winnipeg" },
    );
    assert.equal(coarse.label, WINNIPEG.label);
    assert.equal(coarse.source, "default");

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

  it("requests browser geolocation on Explore when consent is unset and saved Toronto is untrusted", () => {
    assert.equal(
      shouldRequestExploreGeolocation({
        consent: "unset",
        savedTrusted: Boolean(trustedSavedOrigin(SAVED_TORONTO, { timeZone: "America/Winnipeg" })),
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
