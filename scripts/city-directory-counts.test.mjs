import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { directoryCountsFromGroups, directoryCountsFromRows } from "../src/lib/city-directory.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("grouped catalogue rows are the hub and province counts", () => {
  const counts = directoryCountsFromGroups([
    { city: "Winnipeg", province: "MB", n: 663 },
    { city: "Toronto", province: "ON", n: 1304 },
    { city: "Halifax", province: "NS", n: 73 },
    { city: "Montréal", province: "QC", n: 657 },
    { city: "Brandon", province: "MB", n: 12 },
  ]);
  assert.equal(counts.hubs.winnipeg, 663);
  assert.equal(counts.hubs.toronto, 1304);
  assert.equal(counts.hubs.halifax, 73);
  assert.equal(counts.hubs.montreal, 657);
  assert.equal(counts.provinces.MB, 675);
  assert.equal(counts.provinces.ON, 1304);
  assert.equal(counts.hubs.vancouver, 0);
});

test("row counts ignore null slugs, blank names, and admin fixtures", () => {
  const counts = directoryCountsFromRows([
    { slug: "wpg-1", name: "Alpha", city: "Winnipeg", province: "MB" },
    { slug: "null", name: "Missing", city: "Winnipeg", province: "MB" },
    { slug: "wpg-2", name: "   ", city: "Winnipeg", province: "MB" },
    { slug: "ghost", name: "Ghost", city: "Toronto", province: "ON", visibility: "admin_only" },
  ]);
  assert.equal(counts.hubs.winnipeg, 1);
  assert.equal(counts.hubs.toronto, 0);
  assert.equal(counts.provinces.MB, 1);
});

test("city and province pages read the live directory, not only the baked snapshot", () => {
  const hub = readFileSync(join(root, "src/routes/daycare.city.$city.tsx"), "utf8");
  const cities = readFileSync(join(root, "src/routes/cities.tsx"), "utf8");
  assert.match(hub, /liveHubCount\(hub\.slug\)/);
  assert.match(hub, /if \(live != null\) count = live/);
  assert.match(cities, /loadDirectoryCounts/);
  assert.match(cities, /counts\.provinces\[group\.code\]/);
  assert.match(cities, /counts\.hubs\[city\.slug\]/);
});
