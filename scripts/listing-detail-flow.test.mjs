import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { listingOfferGroups } from "../src/lib/listing-offers.ts";

const page = readFileSync(new URL("../src/routes/daycare.$slug.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("offers split meals from programs and drop harvested fee words", () => {
  const offer = listingOfferGroups("meals,outdoor,music,ten-a-day,funded,open-spots", "en");
  assert.deepEqual(offer.meals, ["Meals included"]);
  assert.equal(offer.groups.some((group) => group.items.some((item) => item.includes("$10"))), false);
  assert.equal(offer.groups.find((group) => group.id === "place")?.items.includes("Daily outdoor block"), true);
  assert.equal(offer.groups.find((group) => group.id === "care")?.items.includes("Music program"), true);
  assert.equal(listingOfferGroups("", "fr").groups.length, 0);
});

test("opened listing keeps enquire and drops rental wording", () => {
  assert.match(page, /ke-listing-read/);
  assert.match(page, /data-ke="listing-sticky-cta"/);
  assert.match(page, /data-ke="listing-availability"/);
  assert.match(page, /bookTour/);
  assert.match(page, /ListingRoomRail/);
  assert.match(page, /data-ke="public-room-photos"/);
  assert.match(page, /data-ke="named-room"/);
  assert.match(page, /MealPublicSummary/);
  assert.match(page, /data-ke="listing-meals"/);
  assert.match(page, /data-ke="listing-offers"/);
  assert.match(page, /data-ke="listing-things"/);
  assert.match(page, /data-ke="listing-provider"/);
  assert.match(page, /ReviewSummary/);
  assert.doesNotMatch(page, /Reserve/);
  assert.doesNotMatch(page, /Free cancellation/);
  assert.doesNotMatch(page, /Superhost/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /ke-room-rail/);
  assert.match(readFileSync(new URL("../src/components/daycare-card.tsx", import.meta.url), "utf8"), /data-ke="card-live-pill"/);
});
