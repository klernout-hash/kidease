import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CCHF_DONATE_URL, CCHF_DONATE_URL_FR, SICKKIDS_DONATE_URL, cchfDonateUrl } from "../src/lib/donate-kids.ts";
import { FOOTER_KIDEASE, FOOTER_SUPPORT } from "../src/lib/site-footer-nav.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";
import { LOCALE_PAIRED_PATHS } from "../src/lib/locale-path.ts";
import { MARKETING_PAGE_SEO, MARKETING_PAGE_SEO_FR } from "../src/lib/page-seo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Donate to Kids lives on the KidEase footer column and both menus", () => {
  assert.ok(FOOTER_KIDEASE.some((link) => link.to === "/donate" && link.labelKey === "donateToKids" && link.localePaired));
  assert.ok(!FOOTER_SUPPORT.some((link) => link.to === "/donate"));
  assert.match(src("src/components/shell.tsx"), /donateToKids/);
  assert.match(src("src/components/shell.tsx"), /localePath\("\/donate"/);
  assert.match(src("src/routes/menu.tsx"), /to="\/donate"/);
  assert.match(src("src/routes/menu.tsx"), /donateToKids/);
});

test("donate page deep-links to official foundation pages and does not take payments", () => {
  assert.equal(SICKKIDS_DONATE_URL, "https://donate.sickkidsfoundation.com/ndf");
  assert.equal(CCHF_DONATE_URL, "https://childrenshospitals.donordrive.com/cchf/donate");
  assert.equal(cchfDonateUrl("en"), CCHF_DONATE_URL);
  assert.equal(cchfDonateUrl("fr"), CCHF_DONATE_URL_FR);
  assert.match(SICKKIDS_DONATE_URL, /^https:\/\//);
  assert.match(CCHF_DONATE_URL, /^https:\/\//);
  const page = src("src/routes/donate.tsx");
  assert.match(page, /SICKKIDS_DONATE_URL/);
  assert.match(page, /cchfDonateUrl/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noreferrer"/);
  assert.doesNotMatch(page, /stripe|checkout|card number|payment intent/i);
  assert.doesNotMatch(page, /type="email"|newsletter|opt-in|casl/i);
});

test("donate copy keeps Kyle’s match promise and optional-honesty in EN and FR-CA", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /donateToKids: "Donate to Kids"/);
  assert.match(copy, /donateToKids: "Donner pour les enfants"/);
  assert.match(copy, /Every dollar donated through KidEase, KidEase will match\./);
  assert.match(copy, /Chaque dollar donné par l’intermédiaire de KidEase, KidEase le verse en contrepartie\./);
  assert.match(copy, /Donations are optional/);
  assert.match(copy, /Les dons sont facultatifs/);
  assert.match(copy, /does not process donations/);
  assert.match(copy, /ne traite pas les dons/);
  assert.match(copy, /SickKids Foundation/);
  assert.match(copy, /Children’s Hospital Foundations \(CCHF\)/);
});

test("donate is locale-paired, sitemapped, and registered as a route", () => {
  assert.ok(LOCALE_PAIRED_PATHS.includes("/donate"));
  assert.ok(SITEMAP_STATIC_PATHS.includes("/donate"));
  assert.equal(MARKETING_PAGE_SEO.donate.path, "/donate");
  assert.equal(MARKETING_PAGE_SEO_FR.donate.path, "/fr/donate");
  assert.equal(existsSync(join(root, "src/routes/donate.tsx")), true);
  assert.equal(existsSync(join(root, "src/routes/fr.donate.tsx")), true);
  assert.match(src("src/routeTree.gen.ts"), /id:\s*'\/donate'/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath:\s*'\/fr\/donate'/);
  assert.match(src("public/sitemap.xml"), /https:\/\/www\.kidease\.ca\/donate/);
  assert.match(src("public/sitemap.xml"), /https:\/\/www\.kidease\.ca\/fr\/donate/);
});
