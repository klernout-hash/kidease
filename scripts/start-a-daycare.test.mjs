import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { FOOTER_KIDEASE, FOOTER_DAYCARES } from "../src/lib/site-footer-nav.ts";
import { LOCALE_PAIRED_PATHS } from "../src/lib/locale-path.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";
import { MARKETING_PAGE_SEO, MARKETING_PAGE_SEO_FR } from "../src/lib/page-seo.ts";
import {
  filterStartDaycarePts,
  parseStartDaycareSearch,
  START_DAYCARE_PTS,
} from "../src/lib/start-daycare-hub.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Start a Daycare lives on the KidEase footer and menu, not Daycares", () => {
  assert.ok(FOOTER_KIDEASE.some((link) => link.to === "/start-a-daycare" && link.labelKey === "startADaycare"));
  assert.ok(FOOTER_KIDEASE.some((link) => link.to === "/start-a-daycare" && link.localePaired));
  assert.ok(!FOOTER_DAYCARES.some((link) => link.to === "/start-a-daycare"));
  assert.match(src("src/routes/menu.tsx"), /to="\/start-a-daycare"/);
  assert.match(src("src/components/shell.tsx"), /start-a-daycare/);
});

test("Start a Daycare is one page with honesty first and live claim CTAs", () => {
  const page = src("src/routes/start-a-daycare.tsx");
  assert.match(page, /createFileRoute\("\/start-a-daycare"\)/);
  assert.ok(!/createFileRoute\("\/start-a-daycare\//.test(page));
  assert.doesNotMatch(page, /start-a-daycare\/\$/);
  assert.doesNotMatch(page, /start-a-daycare\/:pt/);
  assert.match(page, /search=\{\{ pt: item\.code/);
  assert.match(page, /to=\{finderPath\}/);
  assert.match(page, /method="get"/);
  const honesty = page.indexOf("startDaycareHonestyT");
  const steps = page.indexOf("startDaycareStepsT");
  const finder = page.indexOf("startDaycareFinderT");
  assert.ok(honesty > 0 && steps > honesty && finder > steps, "honesty, then steps, then province finder");
  assert.match(page, /hash="enroll"/);
  assert.match(page, /enrollToday/);
  assert.match(page, /startDaycareClaimExisting/);
  assert.match(page, /to="\/claim"/);
  assert.match(page, /to="\/verify"/);
  assert.match(page, /to="\/daycare-requirements"/);
  assert.doesNotMatch(page, /childcaresearch\.gov\.mb\.ca/);
  assert.doesNotMatch(page, /pay us to become licensed/i);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /startADaycare: "Start a Daycare"/);
  assert.match(copy, /startADaycare: "Ouvrir une garderie"/);
  assert.match(copy, /enrollToday: "Enroll today!"/);
  assert.match(copy, /does not issue licences/);
  assert.match(copy, /does not award government grants|does not award grants/);
  assert.match(copy, /not a payment to become licensed/);
  assert.match(copy, /will not get you funded|does not award grants/);
});

test("Province finder covers all 13 PTs with official government links only", () => {
  assert.equal(START_DAYCARE_PTS.length, 13);
  const codes = START_DAYCARE_PTS.map((pt) => pt.code);
  assert.deepEqual(codes, ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]);
  for (const pt of START_DAYCARE_PTS) {
    assert.match(pt.licensingUrl, /^https:\/\//);
    assert.match(pt.fundingUrl, /^https:\/\//);
    assert.doesNotMatch(pt.licensingUrl, /kidease\.ca/);
    assert.doesNotMatch(pt.fundingUrl, /kidease\.ca/);
    assert.ok(
      /gov|gouv|gc\.ca|ontario\.ca|alberta\.ca|saskatchewan\.ca|manitoba\.ca|quebec\.ca|gnb\.ca|novascotia|princeedwardisland|yukon\.ca|ece\.gov\.nt|gov\.nl|gov\.nu|childcare\.gov\.nl|childcarenovascotia/i.test(
        pt.licensingUrl + pt.fundingUrl,
      ),
      pt.code,
    );
  }
  assert.ok(START_DAYCARE_PTS.every((pt) => pt.competitive));
  assert.equal(filterStartDaycarePts("québec")[0]?.code, "QC");
  assert.equal(filterStartDaycarePts("manitoba")[0]?.code, "MB");
  assert.equal(filterStartDaycarePts("nwt")[0]?.code, "NT");
  assert.equal(filterStartDaycarePts("xyzzy").length, 0);
  const qc = START_DAYCARE_PTS.find((pt) => pt.code === "QC");
  assert.match(qc.fundingEn, /project call|Québec\.ca|subsidized/i);
  assert.doesNotMatch(qc.fundingEn, /\$350,000/);
  assert.doesNotMatch(src("src/lib/start-daycare-hub.ts"), /KidEase will get you funded/);
  assert.deepEqual(parseStartDaycareSearch({ pt: "mb", q: "Man" }), { pt: "MB", q: "Man" });
  assert.deepEqual(parseStartDaycareSearch({ pt: "/manitoba" }), {});
  assert.equal(parseStartDaycareSearch({ pt: "QC" }).pt, "QC");
});

test("Start a Daycare has paired FR SEO, sitemap, and locale URL", () => {
  assert.ok(LOCALE_PAIRED_PATHS.includes("/start-a-daycare"));
  assert.ok(SITEMAP_STATIC_PATHS.includes("/start-a-daycare"));
  assert.equal(MARKETING_PAGE_SEO.startADaycare.path, "/start-a-daycare");
  assert.equal(MARKETING_PAGE_SEO_FR.startADaycare.path, "/fr/start-a-daycare");
  assert.match(src("src/routes/fr.start-a-daycare.tsx"), /createFileRoute\("\/fr\/start-a-daycare"\)/);
  assert.doesNotMatch(src("src/routeTree.gen.ts"), /start-a-daycare\/\$/);
  const sitemap = src("public/sitemap.xml");
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/start-a-daycare/);
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/fr\/start-a-daycare/);
});
