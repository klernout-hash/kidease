import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";
import { LOCALE_PAIRED_PATHS } from "../src/lib/locale-path.ts";
import {
  NEED_CARE_FAST_CAP,
  NEED_CARE_FAST_MS,
  formatFastKm,
  qualifiesNeedCareFast,
  rankNeedCareFast,
} from "../src/lib/need-care-fast.ts";
import { needCareFastCopy } from "../src/lib/need-care-fast-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-10-03T12:00:00.000Z");

test("need care fast keeps a 7 day confirm and sorts by distance", () => {
  assert.equal(NEED_CARE_FAST_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(qualifiesNeedCareFast({ spots: 2, confirmedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() }, now), true);
  assert.equal(qualifiesNeedCareFast({ spots: 0, confirmedAt: new Date(now).toISOString() }, now), false);
  assert.equal(qualifiesNeedCareFast({ spots: 1, confirmedAt: null }, now), false);
  assert.equal(
    qualifiesNeedCareFast({ spots: 1, confirmedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString() }, now),
    false,
  );
  const ranked = rankNeedCareFast([
    { id: "far", distanceKm: 12, confirmedAt: "2026-10-03T00:00:00.000Z" },
    { id: "near", distanceKm: 1.2, confirmedAt: "2026-10-01T00:00:00.000Z" },
    { id: "mid", distanceKm: 4, confirmedAt: "2026-10-02T00:00:00.000Z" },
  ]);
  assert.deepEqual(ranked.map((row) => row.id), ["near", "mid", "far"]);
  assert.equal(formatFastKm(1.24), "1.2 km");
  assert.equal(NEED_CARE_FAST_CAP, 40);
  const en = needCareFastCopy("en");
  const fr = needCareFastCopy("fr");
  assert.match(en.why, /last 7 days/);
  assert.match(fr.title, /Besoin de garde vite/);
  assert.doesNotMatch(`${en.title} ${en.why} ${fr.why}`, /—|free forever|Winnipeg-based/);
  assert.ok(SITEMAP_STATIC_PATHS.includes("/need-care-fast"));
  assert.ok(LOCALE_PAIRED_PATHS.includes("/need-care-fast"));
  const search = readFileSync(join(root, "src/routes/search.tsx"), "utf8");
  assert.match(search, /to="\/need-care-fast"/);
  assert.match(readFileSync(join(root, "src/lib/server/need-care-fast.ts"), "utf8"), /PUBLIC_LISTING_SQL/);
  assert.match(readFileSync(join(root, "src/lib/server/need-care-fast.ts"), "utf8"), /last_vacancy_updated_at/);
});
