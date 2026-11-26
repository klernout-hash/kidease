import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { shareKitFileName, shareKitPosts, socialImageLines } from "../src/lib/share-kit.ts";

const url = "https://kidease.ca/daycare/little-acorns";

test("share kit posts carry the link in EN and FR", () => {
  for (const locale of ["en", "fr"]) {
    const posts = shareKitPosts({ name: "Little Acorns", city: "Winnipeg", url, locale });
    assert.deepEqual(
      posts.map((p) => p.id),
      ["short", "facebook", "instagram"],
    );
    for (const post of posts) {
      assert.ok(post.text.split(/\s/).some((word) => word === url));
      assert.ok(post.text.includes("Little Acorns (Winnipeg)"));
    }
  }
  assert.match(shareKitPosts({ name: "A", url, locale: "fr" })[1].text, /garderie/);
  assert.doesNotMatch(
    JSON.stringify(shareKitPosts({ name: "A", url, locale: "en" })),
    /daycare center|enrollment/i,
  );
});

test("social image wraps long names to three lines and drops the scheme", () => {
  const lines = socialImageLines({
    name: "The Very Long Name Early Learning and Child Care Centre of North Kildonan and East St. Paul",
    city: "Winnipeg",
    url,
    locale: "en",
  });
  assert.ok(lines.title.length <= 3);
  assert.ok(lines.title[2].endsWith("…"));
  assert.equal(lines.footer, "kidease.ca/daycare/little-acorns");
  assert.match(lines.subtitle, /^Winnipeg · Open spots/);
  assert.match(socialImageLines({ name: "A", url, locale: "fr" }).subtitle, /liste d'attente/);
});

test("file names are safe", () => {
  assert.equal(shareKitFileName("Little Acorns/../x", "qr"), "little-acorns-x-qr.svg");
  assert.equal(shareKitFileName("", "social"), "listing-kidease.png");
});

test("share kit sits on the Listings desk and loads the QR library only when opened", () => {
  const explainer = readFileSync(
    new URL("../src/components/free-listing-share.tsx", import.meta.url),
    "utf8",
  );
  assert.match(explainer, /<ListingShareKit slug=\{row\.slug\}/);
  const kit = readFileSync(
    new URL("../src/components/listing-share-kit.tsx", import.meta.url),
    "utf8",
  );
  assert.match(kit, /import\("qrcode"\)/);
  assert.match(kit, /Nothing is posted for you/);
  assert.match(kit, /Rien n'est publié pour vous/);
});
