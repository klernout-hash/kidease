import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  familyInvitePath,
  growthAttribution,
  growthLoopsEnabled,
  listingShareCard,
  thankYouDecision,
} from "../src/lib/growth-loops.ts";
import { listingOpenGraphImage, listingSeoMeta } from "../src/lib/listing-seo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("growth loops stay off until the flag is set", () => {
  assert.equal(growthLoopsEnabled({}), false);
  assert.equal(growthLoopsEnabled({ FEATURE_GROWTH_LOOPS: "0" }), false);
  assert.equal(growthLoopsEnabled({ FEATURE_GROWTH_LOOPS: "1" }), true);
  assert.equal(thankYouDecision({ enabled: false, referrerId: "a", referredId: "b", alreadyRewarded: false, earnedCount: 0 }), "off");
  assert.equal(growthAttribution({ enabled: false, event: "listing_shared", slug: "sunny" }), null);
});

test("thank-yous are notes, never self or over the cap", () => {
  assert.equal(thankYouDecision({ enabled: true, referrerId: "a", referredId: "a", alreadyRewarded: false, earnedCount: 0 }), "self");
  assert.equal(thankYouDecision({ enabled: true, referrerId: "a", referredId: "b", alreadyRewarded: true, earnedCount: 1 }), "already");
  assert.equal(thankYouDecision({ enabled: true, referrerId: "a", referredId: "b", alreadyRewarded: false, earnedCount: 20 }), "cap");
  assert.equal(thankYouDecision({ enabled: true, referrerId: "a", referredId: "b", alreadyRewarded: false, earnedCount: 3 }), "earn");
});

test("attribution omits email and keeps a safe slug", () => {
  const hit = growthAttribution({
    enabled: true,
    event: "referral_joined",
    code: "abcd2345",
    slug: "Sunny Side!",
    locale: "fr",
  });
  assert.equal(hit?.event, "referral_joined");
  assert.equal(hit?.properties.code, "abcd2345");
  assert.equal(hit?.properties.listing_slug, "sunnyside");
  assert.equal(hit?.properties.locale, "fr");
  assert.equal(JSON.stringify(hit).includes("@"), false);
});

test("family invite paths and share cards stay on the media host", () => {
  assert.equal(familyInvitePath("abcd2345", "fr"), "/fr/welcome/abcd2345");
  assert.equal(familyInvitePath("nope", "en"), "/search");
  const card = listingShareCard({
    enabled: true,
    title: "Sunny Side",
    url: "https://www.kidease.ca/daycare/sunny-side",
    image: "https://media.kidease.ca/photos/buildings/mb-1.jpg",
    locale: "en",
  });
  assert.match(card?.image || "", /^https:\/\/media\.kidease\.ca\//);
  assert.equal(listingShareCard({ enabled: false, title: "A", url: "https://www.kidease.ca/daycare/a", image: "https://media.kidease.ca/photos/a.jpg" }), null);
  assert.equal(
    listingShareCard({
      enabled: true,
      title: "A",
      url: "https://www.kidease.ca/daycare/a",
      image: "https://example.com/child.jpg",
    }),
    null,
  );
});

test("catalogue og:image uses media.kidease.ca and r2.dev is rewritten", () => {
  assert.equal(
    listingOpenGraphImage({ name: "A", slug: "a", photos: ["/photos/buildings/mb-1052.jpg"] }),
    "https://media.kidease.ca/photos/buildings/mb-1052.jpg",
  );
  assert.equal(
    listingOpenGraphImage({
      name: "A",
      slug: "a",
      photos: ["https://pub-9e5f137809844fcdb6d6671cd909f312.r2.dev/photos/buildings/mb-1.jpg"],
    }),
    "https://media.kidease.ca/photos/buildings/mb-1.jpg",
  );
  const meta = listingSeoMeta({ name: "A", slug: "a", city: "Winnipeg", province: "MB", photos: [] });
  assert.equal(meta?.ogImage, "https://www.kidease.ca/og.jpg");
  const sql = readFileSync(join(root, "migrations/0121_growth_loops.sql"), "utf8");
  assert.match(sql, /kind = 'thank_you'/);
  assert.doesNotMatch(sql, /amount_cents|stripe/i);
});
