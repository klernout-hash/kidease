import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  frenchPath,
  hreflangLinks,
  isFrPath,
  localePath,
  localeSwitchPath,
  SITEMAP_FR_PATHS,
  sitemapFrenchPaths,
  stripLocalePrefix,
} from "../src/lib/locale-path.ts";
import { LEGAL_PAGE_SEO_FR, MARKETING_PAGE_SEO_FR, pageSeoHead } from "../src/lib/page-seo.ts";
import { sitemapPublicPaths } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("French paths prefix paired English routes and leave desks alone", () => {
  assert.equal(frenchPath("/"), "/fr");
  assert.equal(frenchPath("/privacy"), "/fr/privacy");
  assert.equal(frenchPath("/fr/help"), "/fr/help");
  assert.equal(stripLocalePrefix("/fr/privacy"), "/privacy");
  assert.equal(stripLocalePrefix("/fr"), "/");
  assert.equal(isFrPath("/fr/search"), true);
  assert.equal(isFrPath("/search"), false);
  assert.equal(localePath("/privacy", "fr"), "/fr/privacy");
  assert.equal(localePath("/search", "fr"), "/search");
  assert.equal(localePath("/parent", "fr"), "/parent");
  assert.equal(localePath("/admin", "fr"), "/admin");
});

test("language toggle rewrites paired pages and stays put on Explore and desks", () => {
  assert.equal(localeSwitchPath("/privacy", "fr"), "/fr/privacy");
  assert.equal(localeSwitchPath("/fr/privacy", "en"), "/privacy");
  assert.equal(localeSwitchPath("/", "fr"), "/fr");
  assert.equal(localeSwitchPath("/fr", "en"), "/");
  assert.equal(localeSwitchPath("/search", "fr"), null);
  assert.equal(localeSwitchPath("/login", "fr"), "/fr/login");
  assert.equal(localeSwitchPath("/fr/login", "en"), "/login");
  assert.equal(localePath("/login", "fr"), "/fr/login");
  assert.equal(localePath("/get-app", "fr"), "/fr/get-app");
  assert.equal(localePath("/benefits", "fr"), "/fr/benefits");
  assert.equal(localeSwitchPath("/parent", "fr"), null);
  assert.equal(localeSwitchPath("/admin", "fr"), null);
  assert.equal(localeSwitchPath("/fr/search", "en"), "/search");
});

test("hreflang includes en, fr, and x-default on paired pages", () => {
  const home = hreflangLinks("/");
  assert.deepEqual(
    home.map((l) => l.hrefLang),
    ["en", "fr", "x-default"],
  );
  assert.equal(home.find((l) => l.hrefLang === "en")?.href, "https://www.kidease.ca/");
  assert.equal(home.find((l) => l.hrefLang === "fr")?.href, "https://www.kidease.ca/fr");
  assert.equal(home.find((l) => l.hrefLang === "x-default")?.href, "https://www.kidease.ca/");
  const privacy = pageSeoHead({
    title: "Privacy · KidEase",
    description: "KidEase privacy notice — PIPEDA, location, processors, and child safety.",
    path: "/privacy",
  });
  assert.ok(privacy.links.some((l) => l.rel === "alternate" && l.hrefLang === "fr" && l.href.endsWith("/fr/privacy")));
  assert.ok(privacy.links.some((l) => l.rel === "canonical" && l.href.endsWith("/privacy")));
  assert.equal(hreflangLinks("/parent").length, 0);
});

test("sitemap lists shipped FR URLs and omits redirect-only pairs", () => {
  assert.deepEqual(SITEMAP_FR_PATHS, sitemapFrenchPaths());
  assert.ok(SITEMAP_FR_PATHS.includes("/fr"));
  assert.ok(SITEMAP_FR_PATHS.includes("/fr/privacy"));
  assert.ok(SITEMAP_FR_PATHS.includes("/fr/search"));
  assert.ok(SITEMAP_FR_PATHS.includes("/fr/help"));
  assert.ok(SITEMAP_FR_PATHS.includes("/fr/get-app"));
  assert.ok(SITEMAP_FR_PATHS.includes("/fr/benefits"));
  assert.ok(SITEMAP_FR_PATHS.includes("/fr/login"));
  assert.ok(!SITEMAP_FR_PATHS.includes("/fr/explore"));
  const paths = sitemapPublicPaths();
  for (const path of SITEMAP_FR_PATHS) assert.ok(paths.includes(path), path);
  const sitemap = src("public/sitemap.xml");
  for (const path of [
    "/fr",
    "/fr/privacy",
    "/fr/terms",
    "/fr/cookies",
    "/fr/help",
    "/fr/search",
    "/fr/contact",
    "/fr/get-app",
    "/fr/benefits",
    "/fr/login",
  ]) {
    assert.match(sitemap, new RegExp(`<loc>https://www.kidease.ca${path}</loc>`));
  }
  assert.doesNotMatch(sitemap, /https:\/\/www\.kidease\.ca\/fr\/explore</);
});

test("security.txt still prefers English and French", () => {
  const security = src("public/.well-known/security.txt");
  assert.match(security, /^Preferred-Languages: en, fr$/m);
});

test("FR routes and language toggle are wired to the existing locale store", () => {
  for (const file of [
    "src/routes/fr.tsx",
    "src/routes/fr.index.tsx",
    "src/routes/fr.search.tsx",
    "src/routes/fr.help.tsx",
    "src/routes/fr.privacy.tsx",
    "src/routes/fr.terms.tsx",
    "src/routes/fr.cookies.tsx",
    "src/routes/fr.contact.tsx",
    "src/routes/fr.get-app.tsx",
    "src/routes/fr.benefits.tsx",
    "src/routes/fr.login.tsx",
  ]) {
    assert.equal(existsSync(join(root, file)), true, file);
  }
  assert.match(src("src/routes/fr.tsx"), /LocalePathBoot locale="fr"/);
  assert.match(src("src/components/language-select.tsx"), /localeSwitchPath/);
  assert.match(src("src/components/native-boot.tsx"), /isFrPath/);
  assert.equal(MARKETING_PAGE_SEO_FR.home.path, "/fr");
  assert.equal(LEGAL_PAGE_SEO_FR.privacy.path, "/fr/privacy");
  assert.match(src("src/lib/copy.ts"), /listingCopyEnNote:/);
  assert.match(src("docs/i18n.md"), /catalogue \/ user-provided copy stay English/);
});
