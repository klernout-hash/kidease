import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { needCareFastEnabled } from "../src/lib/features.ts";
import { needCareFastCopy } from "../src/lib/need-care-fast-copy.ts";
import { normalizeNeedCareFastPage, rankNeedCareFast, rankNeedCareFastByAvailability } from "../src/lib/need-care-fast.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("need care fast availability sort defaults off and does not use Google", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_NEED_CARE_FAST, false);
  assert.equal(needCareFastEnabled({}), false);
  assert.equal(needCareFastEnabled({ FEATURE_NEED_CARE_FAST: "1" }), true);
  const rows = [
    { id: "near-few", distanceKm: 1, confirmedAt: "2026-10-03T00:00:00.000Z", spots: 1 },
    { id: "far-many", distanceKm: 12, confirmedAt: "2026-10-01T00:00:00.000Z", spots: 4 },
    { id: "mid", distanceKm: 3, confirmedAt: "2026-10-02T00:00:00.000Z", spots: 4 },
  ];
  assert.deepEqual(
    rankNeedCareFast(rows).map((row) => row.id),
    ["near-few", "mid", "far-many"],
  );
  assert.deepEqual(
    rankNeedCareFastByAvailability(rows).map((row) => row.id),
    ["mid", "far-many", "near-few"],
  );
  assert.equal(normalizeNeedCareFastPage({}).sort, "distance");
  assert.equal(normalizeNeedCareFastPage({ sort: "spots" }).sort, "spots");
  assert.match(needCareFastCopy("en").leadSpots, /OpenStreetMap/);
  assert.match(needCareFastCopy("en").leadSpots, /does not use Google Maps/);
  assert.match(needCareFastCopy("fr").help, /Aide/);
  const page = read("src/lib/server/need-care-fast-page.ts");
  assert.match(page, /needCareFastEnabled/);
  assert.match(page, /rankNeedCareFastByAvailability/);
  assert.doesNotMatch(page, /maps\.googleapis|google\.maps/i);
  assert.match(read("src/routes/need-care-fast.tsx"), /localePath\("\/help"/);
  assert.match(read(".env.example"), /^FEATURE_NEED_CARE_FAST=0$/m);
});
