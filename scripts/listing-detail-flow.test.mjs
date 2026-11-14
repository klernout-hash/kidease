import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { listingOfferGroups } from "../src/lib/listing-offers.ts";
import { amenityLabel } from "../src/lib/amenities.ts";

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

test("public amenity labels explain the participation flag without claiming a fee", () => {
  for (const [locale, label] of [["en", "Ask about reduced fees"], ["fr", "Renseignez-vous sur les frais réduits"]]) {
    for (const key of ["cwelcc", "CWELCC", " cwelcc "]) {
      assert.equal(amenityLabel(key, locale), label);
      const offer = listingOfferGroups(`meals,${key},music`, locale);
      const publicItems = offer.groups.flatMap((group) => group.items);
      assert.ok(publicItems.includes(label));
      assert.doesNotMatch(JSON.stringify(offer), /cwelcc|\$10|10\s*\$|confirmed|confirmé/i);
      assert.equal(offer.meals.length, 1);
      assert.ok(publicItems.includes(amenityLabel("music", locale)));
    }
  }
});

test("opened listing keeps enquire and drops rental wording", () => {
  assert.match(page, /ke-listing-read/);
  assert.match(page, /data-ke="listing-sticky-cta"/);
  assert.match(readFileSync(new URL("../src/components/listing-parent-pack.tsx", import.meta.url), "utf8"), /data-ke="listing-availability"/);
  assert.match(page, /requestTour/);
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

test("detail keeps one facts group and the same next step on phone and desktop", () => {
  assert.equal((page.match(/<ListingHeaderPills /g) ?? []).length, 1);
  assert.doesNotMatch(page, /<ul[^>]+data-ke="listing-highlights"/);
  assert.equal((page.match(/onClick=\{primaryAction\}/g) ?? []).length, 2);
  assert.match(page, /const primaryAction = live \? onTour : onInfo/);
  assert.match(page, /href="#listing-availability-details"/);
  assert.match(page, /<JoinWaitlist/);
  assert.match(page, /<WaitlistOptIn/);
  assert.match(page, /<RequestTourSheet/);
  assert.match(page, /<RequestInfoSheet/);
  const more = readFileSync(new URL("../src/components/listing-more-actions.tsx", import.meta.url), "utf8");
  assert.match(more, /<details/);
  assert.match(more, /<summary/);
  assert.match(more, /e.key === "Escape"/);
  assert.match(more, /details\.open = false/);
  assert.match(more, /querySelector\("summary"\)\?\.focus\(\)/);
  assert.match(more, /onKeyDown=\{/);
  assert.doesNotMatch(more, /\{open \? \(/);
  const tour = readFileSync(new URL("../src/components/request-tour.tsx", import.meta.url), "utf8");
  assert.match(tour, /unclaimed \? t\("requestTour"\) : t\("bookTour"\)/);
});
