import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { hasLicenceEvidence, publicApprovalEligible } from "../src/lib/approve-live.ts";
import { geocode } from "../src/lib/geo.ts";
import { resolveLocationLock } from "../src/lib/location-lock.ts";
import {
  keepPaintedSearch,
  liveNameSearchHits,
  pickSearchResult,
  placeApprovedCentre,
} from "../src/lib/live-search.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const edmonton = geocode("Edmonton, AB");
const winnipeg = geocode("Winnipeg");

/** Production shape: Live in Admin, Approved on the public page, Edmonton licence 70051797. */
const kidsWorld = {
  id: "d_d85jtifbkh2t",
  daycareId: "d_d85jtifbkh2t",
  slug: "kids-world-daycare-kh2t",
  name: "Kids World Daycare",
  city: "Edmonton",
  province: "AB",
  lat: winnipeg.lat,
  lng: winnipeg.lng,
  licenseNumber: "70051797",
  licenseStatus: "matched",
  licenseVerificationSource: "provider",
  claimStatus: "approved",
  claimed: true,
  claimedAt: "2026-09-22T00:46:52.276Z",
  listingActive: true,
  staffScreeningAttested: true,
  screeningOnFile: false,
  live: true,
  ratingX10: 40,
  reviewCount: 0,
};

function adminShowsLive(centre) {
  return centre.claimStatus === "approved" && hasLicenceEvidence(centre);
}

test("Edmonton Live search keeps kh2t when Admin and the public page say Live", () => {
  assert.ok(edmonton);
  assert.ok(winnipeg);
  assert.equal(adminShowsLive(kidsWorld), true);
  assert.equal(publicApprovalEligible(kidsWorld), true);

  const lock = resolveLocationLock({
    lat: edmonton.lat,
    lng: edmonton.lng,
    label: "Edmonton, AB",
    q: "Edmonton, AB",
  });
  const placed = placeApprovedCentre(kidsWorld, { origin: edmonton, radiusKm: 25, lock });
  assert.ok(placed, "search omitted a Live licensed centre");
  assert.ok(Math.abs(placed.lat - edmonton.lat) < 0.01);
  assert.ok(placed.distanceKm <= 25);

  const alberta = placeApprovedCentre(
    { ...kidsWorld, province: "Alberta" },
    { origin: edmonton, radiusKm: 25, lock },
  );
  assert.ok(alberta, "province Alberta must still match an AB search");

  const card = {
    id: kidsWorld.id,
    slug: kidsWorld.slug,
    name: kidsWorld.name,
    live: true,
  };
  const directory = [{ id: "ab-other", slug: "adventure-time-daycare", name: "ADVENTURE TIME DAYCARE", live: false }];

  const timedOut = pickSearchResult(null, [card]);
  assert.equal(timedOut[0].slug, "kids-world-daycare-kh2t");

  const omitted = pickSearchResult(directory, [card]);
  assert.ok(omitted.some((row) => row.slug === "kids-world-daycare-kh2t" && row.live));

  const notMarkedLive = pickSearchResult([{ ...card, live: false }], [{ ...card, live: true }]);
  assert.equal(notMarkedLive[0].live, true);

  const visible = liveNameSearchHits(omitted, { liveOnly: true, name: "Kids World" });
  assert.deepEqual(
    visible.map((row) => row.slug),
    ["kids-world-daycare-kh2t"],
  );

  const painted = keepPaintedSearch([card], [], true);
  assert.equal(painted[0].slug, "kids-world-daycare-kh2t");
  assert.deepEqual(keepPaintedSearch([card], [], false), []);

  const server = src("src/lib/server/daycares.ts");
  assert.match(server, /liveCardsForSearch/);
  assert.match(server, /pickSearchResult/);
  assert.match(server, /if \(rescue\) writeFreshSearch/);
  assert.match(server, /searchIncludingLive/);

  const merge = src("src/lib/server/approved-search.ts");
  assert.match(merge, /lat between/);
  assert.match(merge, /provinceSearchTokens/);
  assert.match(merge, /centresInLiveSearch/);
});
