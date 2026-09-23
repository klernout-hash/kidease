import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homeLiveStrip } from "../src/lib/home-live-strip.ts";
import { healMediaUrl, listingThumb, LISTING_PLACEHOLDER } from "../src/lib/listing-photo.ts";
import { defaultDistanceUnit, displayDistance } from "../src/lib/units.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("home live strip matches search honesty", () => {
  it("Winnipeg 0 live is not labelled as local All listings", () => {
    const strip = homeLiveStrip(0, 12);
    assert.equal(strip.liveCount, 0);
    assert.equal(strip.liveLabelKey, "liveToggleCount");
    assert.equal(strip.secondaryLabelKey, "featuredStripCount");
    assert.equal(strip.secondaryCount, 12);
    assert.equal(strip.zeroLiveHint, true);
    assert.equal(strip.featuredTitleKey, "featuredStripTitle");
  });

  it("Edmonton 1 live keeps Live · N and All listings · N", () => {
    const strip = homeLiveStrip(1, 12);
    assert.equal(strip.liveCount, 1);
    assert.equal(strip.secondaryLabelKey, "allToggleCount");
    assert.equal(strip.zeroLiveHint, false);
    assert.equal(strip.featuredTitleKey, "featured");
  });

  it("home renders the strip from that helper and the search browse hint", () => {
    const home = src("src/routes/index.tsx");
    const copy = src("src/lib/copy.ts");
    assert.match(home, /homeLiveStrip\(liveCount/);
    assert.match(home, /data-ke="home-zero-live"/);
    assert.match(home, /exploreBrowseHint/);
    assert.doesNotMatch(home, /liveCount > 0 \? t\("liveToggleCount"\)/);
    assert.match(copy, /featuredStripCount: "Featured · \{n\}"/);
    assert.match(copy, /featuredStripCount: "En vedette · \{n\}"/);
    assert.match(copy, /exploreBrowseHint: "\{n\} live · browse directory"/);
    assert.match(copy, /exploreBrowseHint: "\{n\} en ligne · parcourir le répertoire"/);
  });
});

describe("directory cards never paint a broken image for an empty URL", () => {
  it("heals blank and null-like media before an img src", () => {
    assert.equal(healMediaUrl(""), "");
    assert.equal(healMediaUrl("   "), "");
    assert.equal(healMediaUrl("null"), "");
    assert.equal(healMediaUrl("undefined"), "");
    assert.equal(healMediaUrl("https://"), "");
    assert.equal(healMediaUrl("/photos/buildings/mb-1.jpg"), "/photos/buildings/mb-1.jpg");
    assert.equal(listingThumb(["", "null", "https://"]), LISTING_PLACEHOLDER);
  });

  it("hides a failed img and falls back without dropping the transform retry", () => {
    const photo = src("src/components/building-photo.tsx");
    const carousel = src("src/components/photo-carousel.tsx");
    assert.match(photo, /healMediaUrl/);
    assert.match(photo, /data-ke-photo=\{loaded \? "ok" : "pending"\}/);
    assert.match(photo, /invisible absolute inset-0/);
    assert.match(photo, /skipTransform/);
    assert.match(photo, /publicPhotoUrl/);
    assert.match(photo, /isResizedPhotoUrl/);
    assert.match(carousel, /healMediaUrl/);
    assert.match(carousel, /ListingPhotoFallback/);
  });
});

describe("Canada distances stay in kilometres", () => {
  it("en-US browsers on this product still default to km", () => {
    assert.equal(defaultDistanceUnit("en-US"), "km");
    assert.equal(defaultDistanceUnit("fr-CA"), "km");
    assert.equal(displayDistance(25, "km"), "25");
  });

  it("cards, home, and search no longer offer a miles toggle", () => {
    const card = src("src/components/daycare-card.tsx");
    const home = src("src/routes/index.tsx");
    const search = src("src/routes/search.tsx");
    const units = src("src/lib/units.ts");
    assert.match(card, /displayDistance\(distanceKm, "km"\)/);
    assert.doesNotMatch(card, /t\("miAway"\)/);
    assert.match(home, /displayDistance\(radiusKm, "km"\)/);
    assert.match(search, /data-ke="radius-km"/);
    assert.doesNotMatch(search, /setDistanceUnit\("mi"\)/);
    assert.doesNotMatch(search, /unitsMi/);
    assert.match(units, /saved === "mi"/);
    assert.match(units, /writeDistanceUnit\("km"\)/);
  });
});

describe("subscription honesty is one localized line", () => {
  it("drops the duplicate free line and the English fallback under FR", () => {
    const panel = src("src/components/provider-subscription.tsx");
    const copy = src("src/lib/copy.ts");
    assert.match(panel, /data-ke="plans-not-offered"/);
    assert.match(panel, /tx\("plansNotOffered"\)/);
    assert.doesNotMatch(panel, /listingStayFree/);
    assert.doesNotMatch(panel, /PLANS_NOT_OFFERED_YET/);
    assert.match(copy, /plansNotOffered: "Plans are not offered on this site yet. Listing and claim stay free."/);
    assert.match(
      copy,
      /plansNotOffered: "Les forfaits ne sont pas offerts sur ce site pour le moment. La fiche et la réclamation restent gratuites."/,
    );
  });
});

describe("cookie consent does not cover the whole bottom edge", () => {
  it("keeps Essential and Allow, and lets clicks pass outside the card", () => {
    const banner = src("src/components/cookie-consent-banner.tsx");
    const css = src("src/styles.css");
    assert.match(banner, /cookieConsentEssential/);
    assert.match(banner, /cookieConsentAllow/);
    assert.match(banner, /pointer-events-none/);
    assert.match(banner, /ke-cookie-consent-panel pointer-events-auto/);
    assert.match(banner, /dataset\.cookieBanner = "open"/);
    assert.match(css, /html\[data-cookie-banner="open"\] body/);
  });
});
