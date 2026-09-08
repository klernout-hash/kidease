import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { FAQ_ITEM_KEYS } from "../src/lib/faq-items.ts";
import {
  faqPageJsonLd,
  HOME_SEO_DESCRIPTION,
  MARKETING_PAGE_SEO,
  organizationGraphJsonLd,
  organizationJsonLd,
  pageSeoHeadTags,
  softwareApplicationJsonLd,
} from "../src/lib/page-seo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const REQUIRED_PAGES = [
  ["about", "src/routes/about.tsx"],
  ["benefits", "src/routes/benefits.tsx"],
  ["help", "src/routes/help.tsx"],
  ["faq", "src/routes/faq.tsx"],
  ["getApp", "src/routes/get-app.tsx"],
  ["contact", "src/routes/contact.tsx"],
  ["compare", "src/routes/compare.tsx"],
  ["claim", "src/routes/claim.tsx"],
  ["team", "src/routes/team.tsx"],
  ["tourChecklist", "src/routes/tour-checklist.tsx"],
  ["search", "src/routes/search.tsx"],
];

test("marketing pages have unique titles and descriptions that are not the home leak", () => {
  const descriptions = new Set();
  const titles = new Set();
  for (const [key, file] of REQUIRED_PAGES) {
    const page = MARKETING_PAGE_SEO[key];
    assert.ok(page.title.includes("KidEase"), key);
    assert.notEqual(page.description, HOME_SEO_DESCRIPTION, key);
    assert.ok(page.description.length > 40, key);
    assert.equal(descriptions.has(page.description), false, `duplicate desc ${key}`);
    assert.equal(titles.has(page.title), false, `duplicate title ${key}`);
    descriptions.add(page.description);
    titles.add(page.title);
    const route = src(file);
    assert.match(route, /pageSeoHead/);
    assert.match(route, /MARKETING_PAGE_SEO/);
    const tags = pageSeoHeadTags(page);
    assert.equal(tags.some((t) => t.property === "og:title" && t.content === page.title), true);
    assert.equal(tags.some((t) => t.property === "og:description" && t.content === page.description), true);
  }
});

test("FAQ JSON-LD uses the same on-page Q&As and invents nothing", () => {
  assert.equal(FAQ_ITEM_KEYS.length, 8);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /faqQ5: "Does KidEase list nannies or babysitters\?"/);
  assert.match(copy, /licensed daycare directory only/);
  assert.match(copy, /does not process subsidy applications/);
  assert.doesNotMatch(copy, /apply for subsidy on KidEase/);
  const items = [
    { q: "Does KidEase list nannies or babysitters?", a: "No. KidEase is a licensed daycare directory only." },
    { q: "Is it free to search listings?", a: "Yes. Searching the map is free." },
  ];
  const json = faqPageJsonLd(items);
  assert.equal(json["@type"], "FAQPage");
  assert.equal(json.mainEntity.length, 2);
  assert.equal(json.mainEntity[0].name, items[0].q);
  const faqRoute = src("src/routes/faq.tsx");
  assert.match(faqRoute, /faqPageJsonLdScript/);
  assert.match(faqRoute, /FAQ_ITEM_KEYS/);
  assert.match(faqRoute, /faqPageJsonLdScript\(items\)/);
});

test("Organization and SoftwareApplication stay honest", () => {
  const org = organizationJsonLd();
  assert.equal(org.name, "KidEase");
  assert.equal(org.url, "https://www.kidease.ca/");
  assert.equal(org.email, "support@kidease.ca");
  assert.equal(org.address.addressLocality, "Winnipeg");
  assert.equal("aggregateRating" in org, false);
  const app = softwareApplicationJsonLd();
  assert.equal(app.offers.price, "0");
  assert.doesNotMatch(JSON.stringify(app), /download/);
  assert.doesNotMatch(JSON.stringify(app), /aggregateRating/);
  const graph = organizationGraphJsonLd();
  assert.equal(graph["@graph"].length, 2);
  const home = src("src/routes/index.tsx");
  const getApp = src("src/routes/get-app.tsx");
  assert.match(home, /organizationGraphJsonLdScript/);
  assert.match(getApp, /organizationGraphJsonLdScript/);
});
