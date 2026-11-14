import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { START_DAYCARE_PTS } from "../src/lib/start-daycare-hub.ts";
import { START_DAYCARE_PT_CODES, parseStartDaycareSearch, startDaycarePath } from "../src/lib/start-daycare-route.ts";
import { provincialGuideByCode } from "../src/lib/provincial-guides.ts";
import { PROVINCIAL_GUIDE_CODES, provincialGuidePaths, canadaWideChildCareUrl } from "../src/lib/provincial-guide-route.ts";
import { SITEMAP_ORIGIN, sitemapListingPath, isSafeSitemapSlug } from "../src/lib/public-url.ts";
import { PUBLIC_CATALOGUE_SLUGS } from "../src/lib/listing-visibility.ts";
import { looksLikeTestFixture } from "../src/lib/listing-fixture.ts";
import { parentHelperEventProps, reviewSummaryEventProps } from "../src/lib/ai/event-props.ts";
import { cityHubHead } from "../src/lib/city-hub-head.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("light route helpers preserve all canonical province codes and query limits", () => {
  assert.deepEqual(START_DAYCARE_PT_CODES, START_DAYCARE_PTS.map((pt) => pt.code));
  assert.deepEqual(PROVINCIAL_GUIDE_CODES, START_DAYCARE_PTS.map((pt) => pt.code.toLowerCase()));
  for (const pt of START_DAYCARE_PTS) {
    assert.deepEqual(parseStartDaycareSearch({ pt: ` ${pt.code.toLowerCase()} ` }), { pt: pt.code });
    assert.equal(provincialGuideByCode(` ${pt.code.toLowerCase()} `), pt);
    assert.ok(provincialGuidePaths().includes(`/guides/${pt.code.toLowerCase()}`));
  }
  for (const pt of [undefined, null, 42, "unknown", "British Columbia", "US"])
    assert.deepEqual(parseStartDaycareSearch({ pt }), {});
  assert.deepEqual(parseStartDaycareSearch({ pt: " MB ", q: `  ${"é".repeat(90)}  ` }), { pt: "MB", q: "é".repeat(80) });
  assert.deepEqual(parseStartDaycareSearch({ q: 123 }), {});
  assert.equal(startDaycarePath("fr"), "/fr/start-a-daycare");
  assert.equal(startDaycarePath("en"), "/start-a-daycare");
  assert.equal(canadaWideChildCareUrl("fr"), "https://www.canada.ca/fr/emploi-developpement-social/programmes/apprentissage-garde-jeunes-enfants.html");
});

test("pure URL and analytics helpers keep the existing output semantics", () => {
  assert.equal(SITEMAP_ORIGIN, "https://www.kidease.ca");
  assert.equal(sitemapListingPath("centre-école"), "/daycare/centre-école");
  assert.deepEqual(parentHelperEventProps(), {});
  assert.deepEqual(parentHelperEventProps({ path: " https://external.invalid/ " }), {});
  assert.deepEqual(parentHelperEventProps({ path: " /fr/faq " }), { path: "/fr/faq" });
  assert.deepEqual(reviewSummaryEventProps({ daycareId: " centre-1 ", count: 3 }), { daycare_id: "centre-1", review_count: 3 });
  assert.deepEqual(reviewSummaryEventProps({ daycareId: "name@example.invalid", count: -1 }), {});
});

test("light slug checks retain fixture exclusions and the shared catalogue exception set", () => {
  for (const slug of ["test-ghost", "test-ghost-claim-lab", "qa-centre", "qa", "peninsula-montessori-academy-oak-3572", "null", "undefined", "bad/path"])
    assert.equal(isSafeSitemapSlug(slug), false, slug);
  for (const slug of ["teston-child-care", "testing-academy", "kids-world-daycare-kh2t", "la-bulle-de-lait-"])
    assert.equal(isSafeSitemapSlug(slug), true, slug);
  const slug = "test-allowed-catalogue-exception";
  assert.equal(isSafeSitemapSlug(slug), false);
  PUBLIC_CATALOGUE_SLUGS.add(slug);
  try {
    assert.equal(looksLikeTestFixture({ slug }), false);
    assert.equal(isSafeSitemapSlug(slug), true);
  } finally {
    PUBLIC_CATALOGUE_SLUGS.delete(slug);
  }
});

test("city metadata preserves EN/FR canonical tags and missing-hub noindex", () => {
  const snapshot = { slug: "montreal", city: "Montréal", province: "QC", count: 1234, listings: [], subsidyUrl: "", subsidyLabel: "" };
  const en = cityHubHead(snapshot, "en"), fr = cityHubHead(snapshot, "fr");
  assert.equal(en.meta.find((tag) => tag.title)?.title, "Licensed daycare in Montreal, QC · KidEase");
  assert.equal(fr.meta.find((tag) => tag.title)?.title, "Garderies permises à Montréal, Qc · KidEase");
  assert.match(en.meta.find((tag) => tag.name === "description").content, /Browse 1,234 licensed centres/);
  assert.match(fr.meta.find((tag) => tag.name === "description").content, /Parcourez 1.234 centres/);
  assert.equal(en.links.find((tag) => tag.rel === "canonical").href, "https://www.kidease.ca/daycare/city/montreal");
  assert.equal(fr.links.find((tag) => tag.rel === "canonical").href, "https://www.kidease.ca/fr/daycare/city/montreal");
  assert.ok(fr.links.some((tag) => tag.hrefLang === "en" && tag.href === "https://www.kidease.ca/daycare/city/montreal"));
  assert.equal(cityHubHead(undefined).meta.find((tag) => tag.name === "robots").content, "noindex, nofollow");
});

test("startup helpers execute without resolving guide data, catalogue filtering or AI schemas", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kidease-light-helpers-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const loader = join(directory, "deny-heavy.mjs");
  writeFileSync(loader, `
    export async function resolve(specifier, context, nextResolve) {
      if (/zod|(?:start-daycare-hub|provincial-guides|sitemap|listing-visibility)\\.ts$|\\.json$/.test(specifier))
        throw new Error('Heavy dependency reached: ' + specifier);
      return nextResolve(specifier, context);
    }
  `);
  const imports = ["public-url.ts", "start-daycare-route.ts", "provincial-guide-route.ts", "ai/event-props.ts"]
    .map((file) => `await import(${JSON.stringify(pathToFileURL(join(root, "src/lib", file)).href)});`).join("\n");
  execFileSync(process.execPath, ["--experimental-strip-types", "--experimental-loader", pathToFileURL(loader).href, "--input-type=module", "-e", imports], {
    cwd: root, timeout: 10_000, stdio: "pipe",
  });
});

test("city metadata executes without resolving catalogue loaders, SQL or global data", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kidease-city-head-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const loader = join(directory, "deny-catalogue.mjs");
  writeFileSync(loader, `
    export async function resolve(specifier, context, nextResolve) {
      if (/server\\/|(?:catalog|catalog-neon|city-hub-page|db)\\.ts$/.test(specifier))
        throw new Error('Catalogue dependency reached: ' + specifier);
      return nextResolve(specifier, context);
    }
  `);
  const url = pathToFileURL(join(root, "src/lib/city-hub-head.ts")).href;
  execFileSync(process.execPath, ["--experimental-strip-types", "--experimental-loader", pathToFileURL(loader).href, "--input-type=module", "-e", `const { cityHubHead } = await import(${JSON.stringify(url)}); cityHubHead(undefined);`], {
    cwd: root, timeout: 10_000, stdio: "pipe",
  });
});
