import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CCHF_DONATE_URL, SICKKIDS_DONATE_URL, cchfDonateUrl } from "../src/lib/donate.ts";
import { FOOTER_KIDEASE, FOOTER_SUPPORT, footerLinkLabel } from "../src/lib/site-footer-nav.ts";
import { MARKETING_PAGE_SEO, MARKETING_PAGE_SEO_FR } from "../src/lib/page-seo.ts";
import { localePath } from "../src/lib/locale-path.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const copySrc = src("src/lib/copy.ts");

function copyValue(key, locale) {
  const start = locale === "fr" ? copySrc.indexOf("\n  fr: {") : copySrc.indexOf("export const copy");
  const end = locale === "fr" ? copySrc.length : copySrc.indexOf("\n  fr: {");
  const block = copySrc.slice(start, end);
  const match = block.match(new RegExp(`\\n    ${key}: "([^"]*)"`));
  assert.ok(match, `copy ${locale}.${key}`);
  return match[1];
}

test("Kyle’s EN label stays Donate to Kids and FR matches the footer pattern", () => {
  assert.equal(copyValue("donateToKids", "en"), "Donate to Kids");
  assert.equal(copyValue("donateTitle", "en"), "Donate to Kids");
  assert.equal(copyValue("donateToKids", "fr"), "Faire un don aux enfants");
  assert.equal(copyValue("donateMatch", "en"), "Every dollar donated through KidEase, KidEase will match.");
  assert.match(copyValue("donateOptional", "en"), /optional/i);
  const t = (key) => copyValue(key, "en");
  const donate = FOOTER_KIDEASE.find((link) => link.to === "/donate");
  assert.ok(donate);
  assert.equal(footerLinkLabel(donate, t, "en"), "Donate to Kids");
  assert.equal(donate.localePaired, true);
  assert.ok(!FOOTER_SUPPORT.some((link) => link.to === "/donate"));
});

test("donate page opens official foundation forms, not a KidEase processor", () => {
  assert.equal(SICKKIDS_DONATE_URL, "https://donate.sickkidsfoundation.com/ndf?type=One-time");
  assert.equal(CCHF_DONATE_URL, "https://childrenshospitals.donordrive.com/cchf/donate");
  assert.equal(cchfDonateUrl("en"), `${CCHF_DONATE_URL}?language=en`);
  assert.equal(cchfDonateUrl("fr"), `${CCHF_DONATE_URL}?language=fr`);
  const page = src("src/routes/donate.tsx");
  assert.match(page, /sickKidsDonateUrl/);
  assert.match(page, /cchfDonateUrl/);
  assert.match(page, /target="_blank"/);
  assert.doesNotMatch(page, /stripe/i);
  assert.doesNotMatch(page, /checkout/i);
});

test("hamburger, app menu, and footer all point at /donate", () => {
  assert.match(src("src/components/shell.tsx"), /donateToKids/);
  assert.match(src("src/components/shell.tsx"), /localePath\("\/donate"/);
  assert.match(src("src/routes/menu.tsx"), /to="\/donate"/);
  assert.match(src("src/routes/menu.tsx"), /donateToKids/);
  assert.equal(localePath("/donate", "fr"), "/fr/donate");
  assert.equal(MARKETING_PAGE_SEO.donate.path, "/donate");
  assert.equal(MARKETING_PAGE_SEO_FR.donate.path, "/fr/donate");
  assert.match(src("public/sitemap.xml"), /https:\/\/www\.kidease\.ca\/donate/);
  assert.match(src("public/sitemap.xml"), /https:\/\/www\.kidease\.ca\/fr\/donate/);
});
