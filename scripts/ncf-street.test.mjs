import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { ncfStreetEnabled } from "../src/lib/features.ts";
import {
  NCF_STREET_RADIUS_KM,
  NOMINATIM_ORIGIN,
  geocodeStreetAddress,
  looksLikeStreetAddress,
  nominatimSearchUrl,
  parseNominatimBody,
  streetQueryHash,
  withinStreetRadius,
} from "../src/lib/ncf-street.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("street matching stays off and never calls Google", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_NCF_STREET, false);
  assert.equal(ncfStreetEnabled({}), false);
  assert.equal(looksLikeStreetAddress("Winnipeg"), false);
  assert.equal(looksLikeStreetAddress("Toronto, ON"), false);
  assert.equal(looksLikeStreetAddress("123 Main Street, Winnipeg"), true);
  const src = readFileSync(join(root, "src/lib/ncf-street.ts"), "utf8");
  assert.match(src, /nominatim\.openstreetmap\.org/);
  assert.doesNotMatch(src, /googleapis|maps\.google|google\.com\/maps/i);
  const url = new URL(nominatimSearchUrl("123 Main Street, Winnipeg"));
  assert.equal(url.origin, NOMINATIM_ORIGIN);
  assert.equal(url.searchParams.get("countrycodes"), "ca");
  assert.equal(NCF_STREET_RADIUS_KM, 15);
  assert.equal(withinStreetRadius(15), true);
  assert.equal(withinStreetRadius(15.1), false);
});

test("Nominatim JSON becomes a Canada pin and the address is hashed", () => {
  const pin = parseNominatimBody([
    { lat: "49.8951", lon: "-97.1384", display_name: "123 Main Street, Winnipeg, Manitoba, Canada" },
  ]);
  assert.equal(pin?.label, "123 Main Street, Winnipeg, Manitoba");
  assert.equal(parseNominatimBody([{ lat: "40", lon: "-74", display_name: "New York" }]), null);
  assert.equal(parseNominatimBody([]), null);
  const hash = streetQueryHash("  123   Main Street, Winnipeg ");
  assert.equal(hash, streetQueryHash("123 main street, winnipeg"));
  assert.equal(hash.length, 64);
  assert.doesNotMatch(hash, /main street/i);
});

test("geocode uses the cache and skips the network when the flag is off", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify([{ lat: "43.65", lon: "-79.38", display_name: "1 King St, Toronto, Ontario" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const off = await geocodeStreetAddress("1 King St, Toronto", { enabled: false, fetchImpl });
  assert.equal(off, null);
  assert.equal(calls, 0);
  const memory = new Map();
  const cache = {
    async get(hash) {
      return memory.get(hash) ?? null;
    },
    async set(hash, pin) {
      memory.set(hash, pin);
    },
  };
  const hit = await geocodeStreetAddress("1 King St, Toronto", { enabled: true, fetchImpl, cache });
  assert.equal(hit?.lat, 43.65);
  assert.equal(calls, 1);
  const again = await geocodeStreetAddress("1 King St, Toronto", { enabled: true, fetchImpl, cache });
  assert.equal(again?.lng, -79.38);
  assert.equal(calls, 1);
});
