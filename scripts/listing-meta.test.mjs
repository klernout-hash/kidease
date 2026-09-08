import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  listingLabelFromSlug,
  listingPageDescription,
  listingPageMeta,
  listingPageTitle,
} from "../src/lib/listing-meta.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("slug labels drop the trailing id and stay unique per listing", () => {
  assert.equal(listingLabelFromSlug("bonnie-bairns-childcare-services-1"), "Bonnie Bairns Childcare Services");
  assert.equal(listingLabelFromSlug("st-matthews-day-care-society-21"), "St Matthews Day Care Society");
  assert.equal(listingLabelFromSlug(""), "");
  const a = listingPageMeta({ slug: "sunny-side-child-care-9" });
  const b = listingPageMeta({ slug: "willow-point-children-s-centre-2" });
  assert.notEqual(a.title, b.title);
  assert.notEqual(a.description, b.description);
  assert.match(a.title, /Sunny Side Child Care/);
  assert.match(a.title, /KidEase/);
  assert.match(a.description, /Sunny Side Child Care/);
});

test("name and city win over the slug fallback", () => {
  assert.equal(
    listingPageTitle({
      name: "Harrow House",
      city: "Winnipeg",
      province: "MB",
      slug: "harrow-house-99",
    }),
    "Harrow House · Daycare in Winnipeg, MB · KidEase",
  );
  assert.match(
    listingPageDescription({
      name: "Harrow House",
      city: "Winnipeg",
      province: "MB",
    }),
    /Harrow House in Winnipeg, MB/,
  );
  assert.equal(listingPageTitle({ name: "Harrow House" }), "Harrow House · Licensed daycare · KidEase");
});

test("daycare route exposes unique title and description hooks", () => {
  const route = readFileSync(join(root, "src/routes/daycare.$slug.tsx"), "utf8");
  assert.match(route, /listingPageMeta/);
  assert.match(route, /listingPageTitle/);
  assert.match(route, /head:\s*\(\{\s*params,\s*loaderData\s*\}\)/);
  assert.match(route, /name:\s*"description"/);
  assert.match(route, /document\.title = listingSeoPageTitle/);
  assert.match(route, /listingPageTitle\(d\)/);
  assert.match(route, /listingSeoHeadTags/);
  assert.match(route, /application\/ld\+json/);
});
