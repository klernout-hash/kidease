import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { commuteMidpoint, commuteQueryRadiusKm, isAlongCommute } from "../src/lib/commute-route.ts";
import { copy } from "../src/lib/copy.ts";
import {
  TRACK_NOTE_MAX,
  TRACK_STATUSES,
  clampTrackNote,
  normalizeShareEmail,
  parseShareToken,
  parseTrackStatus,
} from "../src/lib/parent-tracker.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const home = { lat: 43.6532, lng: -79.3832 };
const work = { lat: 43.589, lng: -79.6441 };

describe("parent tracker", () => {
  test("statuses and notes stay inside the free tracker", () => {
    assert.deepEqual(TRACK_STATUSES, ["interested", "called", "toured", "waitlisted", "enrolled"]);
    assert.equal(parseTrackStatus("toured"), "toured");
    assert.equal(parseTrackStatus("paid"), "interested");
    assert.equal(clampTrackNote(`  ${"a".repeat(TRACK_NOTE_MAX + 40)}  `).length, TRACK_NOTE_MAX);
    assert.equal(clampTrackNote("hello\u0000"), "hello");
    assert.equal(normalizeShareEmail(" Parent@Example.com "), "parent@example.com");
    assert.equal(normalizeShareEmail("not-an-email"), null);
    assert.equal(parseShareToken("A".repeat(64).toLowerCase()), "a".repeat(64));
    assert.equal(parseShareToken("short"), null);
  });

  test("along-route keeps the line and drops a point well off it", () => {
    const mid = commuteMidpoint(home, work);
    assert.equal(isAlongCommute(home, work, mid), true);
    assert.equal(isAlongCommute(home, work, home), true);
    assert.equal(isAlongCommute(home, work, { lat: mid.lat + 0.12, lng: mid.lng }), false);
    assert.equal(commuteQueryRadiusKm(home, work, 10) <= 50, true);
    assert.equal(commuteQueryRadiusKm(home, { lat: home.lat + 2, lng: home.lng }, 5), 50);
  });
});

describe("parent tools wiring", () => {
  test("search unions the commute corridor after the two-circle results", () => {
    const search = src("src/lib/server/daycares.ts");
    const nearby = src("src/lib/server/nearby.ts");
    assert.match(search, /nearbyListingsDual/);
    assert.match(search, /nearbyListingsAlong/);
    assert.match(search, /anchors\.intersect && anchors\.secondary/);
    assert.match(nearby, /isAlongCommute/);
    const along = nearby.slice(nearby.indexOf("export async function nearbyListingsAlong"));
    assert.doesNotMatch(along, /featuredCity|priority|paid/);
  });

  test("saved rows follow the shared owner and the invite token is not logged", () => {
    const family = src("src/lib/server/family.ts");
    const tracker = src("src/lib/server/parent-tracker.ts");
    const migration = src("migrations/0079_parent_tracker.sql");
    assert.match(family, /shortlistUserId/);
    assert.match(family, /track_status/);
    assert.match(migration, /shortlist_shares/);
    assert.match(migration, /saved_daycares_track_status_chk/);
    assert.match(tracker, /createHash\("sha256"\)/);
    assert.doesNotMatch(tracker, /console\.(log|info|debug|warn|error)/);
    assert.match(src("src/routes/parent.tsx"), /parseShareToken/);
    assert.match(src("src/components/parent-shortlist.tsx"), /data-ke="saved-map-toggle"/);
    assert.match(src("src/components/parent-shortlist.tsx"), /data-ke="shortlist-share"/);
    assert.match(src("src/components/saved-track.tsx"), /data-ke="saved-track"/);
  });

  test("copy stays honest and covers the tracker in English and French", () => {
    for (const locale of ["en", "fr"]) {
      const pack = copy[locale];
      assert.match(pack.trackCalled, /\S/);
      assert.match(pack.shareShortlistLead, /coming soon|bientôt/i);
      assert.match(pack.anchorBothHint, /\{n\}/);
      assert.match(pack.anchorBothHint, /\{u\}/);
      assert.doesNotMatch(pack.shortlistLead, /free forever|gratuit pour toujours|Winnipeg-based/i);
      assert.doesNotMatch(`${pack.shareShortlistLead} ${pack.trackNotesPrivate} ${pack.anchorBothHint}`, /—/);
    }
    assert.match(copy.en.anchorBothHint, /along the route/);
    assert.match(copy.fr.noDualResults, /trajet/);
  });
});
