import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AGE_VACANCY_MIN_LISTINGS,
  ageVacancySitemapPaths,
  buildAgeVacancyPages,
  cityAgeSlug,
  listingServesAge,
  renderAgeVacancySitemapXml,
} from "../src/lib/age-vacancy.ts";
import { ageVacancyCopy } from "../src/lib/age-vacancy-copy.ts";
import { isCatalogueDocumentPath } from "../src/lib/locale-path.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function row(i, city, ageMin, ageMax, extra = {}) {
  return {
    id: `d_${i}`,
    slug: `centre-${i}`,
    name: `Centre ${i}`,
    city,
    province: "MB",
    ageMinMonths: ageMin,
    ageMaxMonths: ageMax,
    spotsInfant: 1,
    infantMonthly: 400 + i,
    ...extra,
  };
}

test("city age pages need 5 real aged listings and skip thin cities", () => {
  assert.equal(AGE_VACANCY_MIN_LISTINGS, 5);
  assert.equal(cityAgeSlug("Montréal"), "montreal");
  assert.equal(listingServesAge(0, 12, "infant"), true);
  assert.equal(listingServesAge(0, 12, "toddler"), false);
  assert.equal(listingServesAge(null, 12, "infant"), false);

  const thin = Array.from({ length: 4 }, (_, i) => row(i, "Brandon", 0, 12));
  const enough = Array.from({ length: 5 }, (_, i) => row(i + 10, "Winnipeg", 0, 18));
  const noAge = Array.from({ length: 8 }, (_, i) => row(i + 20, "Thompson", null, null));
  const pages = buildAgeVacancyPages([...thin, ...enough, ...noAge]);
  assert.deepEqual(pages.map((page) => `${page.citySlug}/${page.age}`), ["winnipeg/infant", "winnipeg/toddler"]);
  const infant = pages.find((page) => page.age === "infant");
  assert.equal(infant?.centres, 5);
  assert.equal(infant?.openSpots, 5);
  assert.equal(infant?.averageFee != null, true);
  const noFee = buildAgeVacancyPages(
    Array.from({ length: 5 }, (_, i) => row(i + 40, "Selkirk", 36, 60, { infantMonthly: 0, preschoolMonthly: null, spotsPreschool: 0 })),
  );
  assert.equal(noFee[0]?.averageFee, null);
  assert.equal(noFee[0]?.openSpots, 0);

  const paths = ageVacancySitemapPaths([...thin, ...enough]);
  assert.deepEqual(paths, ["/daycare/winnipeg/infant", "/daycare/winnipeg/toddler"]);
  assert.match(renderAgeVacancySitemapXml(paths), /https:\/\/www\.kidease\.ca\/daycare\/winnipeg\/infant/);
  assert.equal(isCatalogueDocumentPath("/daycare/winnipeg/infant"), true);
  assert.equal(isCatalogueDocumentPath("/daycare/city/winnipeg"), true);

  const en = ageVacancyCopy("en");
  const fr = ageVacancyCopy("fr");
  assert.match(en.title("Winnipeg", "infant"), /Infant daycare in Winnipeg/);
  assert.match(fr.title("Winnipeg", "infant"), /nourrissons/);
  assert.doesNotMatch(`${en.why("infant")} ${fr.why("infant")} ${en.fee(10)}`, /—|free forever|Winnipeg-based/);
  const robots = readFileSync(join(root, "public/robots.txt"), "utf8");
  assert.match(robots, /Sitemap: https:\/\/www\.kidease\.ca\/sitemap-age-vacancy\.xml/);
  assert.match(readFileSync(join(root, "src/lib/server/age-vacancy.ts"), "utf8"), /PUBLIC_LISTING_SQL/);
  assert.match(readFileSync(join(root, "server/middleware/sitemap.ts"), "utf8"), /sitemap-age-vacancy\.xml/);
});
