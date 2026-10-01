import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { decideListingLoader } from "../src/lib/listing-not-found.ts";
import { isSafeSitemapSlug } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("subtle text clears 4.5 to 1 on the light page", () => {
  const css = readFileSync(join(root, "src/styles.css"), "utf8");
  assert.match(css, /--color-subtle: #6a645c;/);
  assert.doesNotMatch(css.split("data-theme")[0], /--color-subtle: #8a847a/);
});

test("a missing or null slug is not a listing link and is a 404", () => {
  assert.equal(isSafeSitemapSlug("null"), false);
  assert.equal(isSafeSitemapSlug("undefined"), false);
  assert.equal(isSafeSitemapSlug(""), false);
  assert.equal(decideListingLoader("null", { slug: "null" }, null).type, "not-found");
  const map = readFileSync(join(root, "src/components/map-view.tsx"), "utf8");
  const home = readFileSync(join(root, "src/components/parent-home.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/daycare-card.tsx"), "utf8");
  assert.match(map, /isSafeSitemapSlug\(item\.slug\)/);
  assert.match(home, /isSafeSitemapSlug\(item\.slug\)/);
  assert.match(card, /isSafeSitemapSlug\(slug\)/);
  const search = readFileSync(join(root, "src/routes/search.tsx"), "utf8");
  assert.match(search, /min-h-11 shrink-0 items-center text-sm font-medium text-primary/);
});
