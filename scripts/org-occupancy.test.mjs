import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { orgTotals, siteOccupancy } from "../src/lib/org-occupancy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const site = {
  id: "c1",
  name: "Maple",
  city: "Ottawa",
  province: "ON",
};

test("org occupancy stays off and does not invent a percent", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_ORG_DASHBOARD, false);
  assert.match(src(".env.example"), /^FEATURE_ORG_DASHBOARD=0$/m);
  assert.match(src("src/lib/server/org-occupancy.ts"), /licensed_capacity/);
  assert.match(src("src/lib/server/org-occupancy.ts"), /confirmed_open_spots/);
  assert.match(src("src/routes/provider.tsx"), /desk === "sites"/);
  const missing = siteOccupancy({ ...site, licensedCapacity: null, enrolled: 10, openSpots: null });
  assert.equal(missing.occupancyPercent, null);
  assert.equal(missing.note, "capacity-missing");
  const ready = siteOccupancy({ ...site, licensedCapacity: 40, enrolled: 10, openSpots: 2 });
  assert.equal(ready.occupancyPercent, 25);
  const totals = orgTotals([
    ready,
    siteOccupancy({ ...site, id: "c2", licensedCapacity: null, enrolled: null, openSpots: 1 }),
  ]);
  assert.equal(totals.ready, 1);
  assert.equal(totals.capacity, 40);
  assert.equal(totals.occupancyPercent, 25);
});
