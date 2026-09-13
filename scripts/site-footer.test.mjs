import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  FOOTER_COLUMNS,
  FOOTER_DAYCARES,
  FOOTER_KIDEASE,
  FOOTER_PARENTS,
  FOOTER_SUPPORT,
  footerLinkLabel,
  sortFooterLinks,
} from "../src/lib/site-footer-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const footer = src("src/components/site-footer.tsx");
const nav = src("src/lib/site-footer-nav.ts");
const menu = src("src/routes/menu.tsx");
const css = src("src/styles.css");
const copySrc = src("src/lib/copy.ts");

function copyValue(key, locale) {
  const start = locale === "fr" ? copySrc.indexOf("\n  fr: {") : copySrc.indexOf("export const copy");
  const end = locale === "fr" ? copySrc.length : copySrc.indexOf("\n  fr: {");
  const block = copySrc.slice(start, end);
  const match = block.match(new RegExp(`\\n    ${key}: "([^"]*)"`));
  assert.ok(match, `copy ${locale}.${key}`);
  return match[1];
}

function labels(links, locale) {
  const t = (key) => copyValue(key, locale);
  return sortFooterLinks(
    links.map((link) => ({ ...link, label: footerLinkLabel(link, t, locale) })),
    locale,
  ).map((link) => link.label);
}

function destinations(links) {
  return links.map((link) => `${link.to}|${JSON.stringify(link.search ?? {})}|${link.localePaired ? "paired" : "bare"}`);
}

test("footer exposes Rate KidEase next to Get the app in Parents", () => {
  const getApp = nav.match(/"\/get-app"/g) ?? [];
  assert.ok(getApp.length >= 2, "Get the app + Rate KidEase both link to /get-app on www");
  assert.match(nav, /rateKidEase/);
  assert.match(nav, /rateKidEaseFromMenu/);
});

test("footer keeps Parents / Daycares / KidEase / Support groups without a duplicate legal row", () => {
  assert.match(footer, /ke-footer-cols/);
  assert.match(footer, /data-footer-col=\{id\}/);
  assert.match(footer, /id="parents"/);
  assert.match(footer, /id="daycares"/);
  assert.match(footer, /id="kidease"/);
  assert.match(footer, /id="support"/);
  assert.match(footer, /t\("app"\)/);
  assert.match(footer, /t\("support"\)/);
  assert.match(footer, /title="Parents"/);
  assert.match(footer, /Garderies/);
  assert.match(footer, /Daycares/);
  assert.doesNotMatch(footer, /aria-label=\{fr \? "Juridique" : "Legal"\}/);
  const privacyLinks = nav.match(/"\/privacy"/g) ?? [];
  assert.equal(privacyLinks.length, 1, "privacy lives in Support only; verify-listings goes to /verify");
  assert.match(nav, /"\/about"/);
  assert.match(nav, /"\/verify"/);
  assert.match(nav, /verifyListings/);
});

test("hamburger stays Parents, Daycares, Caregivers, Support; footer is Parents, Daycares, KidEase, Support", () => {
  const footerParents = footer.indexOf('id="parents"');
  const footerDaycares = footer.indexOf('id="daycares"');
  const footerKidEase = footer.indexOf('id="kidease"');
  const footerSupport = footer.indexOf('id="support"');
  assert.ok(
    footerParents > 0 &&
      footerDaycares > footerParents &&
      footerKidEase > footerDaycares &&
      footerSupport > footerKidEase,
  );

  const menuParents = menu.indexOf('title="Parents"');
  const menuDaycares = menu.indexOf('title={fr ? "Garderies" : "Daycares"}');
  const menuCaregivers = menu.indexOf('t("footerCaregivers")');
  const menuSupport = menu.indexOf('title={fr ? "Soutien" : "Support"}');
  assert.ok(menuParents > 0 && menuDaycares > menuParents && menuCaregivers > menuDaycares && menuSupport > menuCaregivers);
  assert.match(copySrc, /footerCaregivers: "Caregivers & jobs"/);
  assert.match(copySrc, /footerCaregivers: "Éducatrices et emplois"/);
});

test("footer legal bar stays compact and uses FR-CA copy keys", () => {
  assert.match(footer, /ke-footer-inner/);
  assert.match(footer, /t\("footerCopy"\)/);
  assert.match(footer, /t\("neverSell"\)/);
  assert.match(footer, /t\("appStore"\)/);
  assert.match(footer, /t\("googlePlay"\)/);
  assert.match(footer, /t\("comingSoon"\)/);
  assert.match(footer, /t\("operatorSignIn"\)/);
  assert.match(footer, /showOperatorSignIn/);
  assert.match(footer, /isKidEaseOperatorEmail\(user\?\.primaryEmail\)/);
  assert.match(copySrc, /comingSoon: "Coming soon"/);
  assert.match(copySrc, /comingSoon: "Bientôt"/);
  assert.match(copySrc, /operatorSignIn: "Operator sign-in"/);
  assert.match(copySrc, /operatorSignIn: "Connexion opérateur"/);
});

test("Support column keeps help, contact, FAQ, and legal links", () => {
  const supportTo = FOOTER_SUPPORT.map((link) => link.to);
  assert.ok(supportTo.includes("/help"));
  assert.ok(FOOTER_SUPPORT.some((link) => link.to === "/help" && link.localePaired));
  assert.ok(supportTo.includes("/contact"));
  assert.ok(supportTo.includes("/faq"));
  assert.ok(supportTo.includes("/how-it-works"));
  assert.ok(supportTo.includes("/privacy"));
  assert.ok(supportTo.includes("/terms"));
  assert.ok(supportTo.includes("/cookies"));
  assert.ok(!supportTo.includes("/delete-account"));
  assert.doesNotMatch(nav, /delete-account/);
  assert.doesNotMatch(footer, /SUPPORT_INBOX_EMAIL/);
  assert.doesNotMatch(footer, /mailto:/);
  assert.doesNotMatch(nav, /SUPPORT_INBOX_EMAIL/);
  assert.doesNotMatch(nav, /mailto:/);
  assert.match(copySrc, /contactTitle: "Contact Us"/);
  assert.match(copySrc, /contactTitle: "Nous joindre"/);
});

test("Support column still includes About, Team, and verify listings", () => {
  const supportTo = FOOTER_SUPPORT.map((link) => link.to);
  assert.ok(supportTo.includes("/about"));
  assert.ok(supportTo.includes("/team"));
  assert.ok(supportTo.includes("/verify"));
});

test("Daycares column keeps verify listings and drops About, Team, and Manitoba Child Care", () => {
  const daycareTo = FOOTER_DAYCARES.map((link) => link.to);
  assert.ok(daycareTo.includes("/verify"));
  assert.ok(!daycareTo.includes("/about"));
  assert.ok(!daycareTo.includes("/team"));
  assert.doesNotMatch(nav, /mbChildcare/);
  assert.doesNotMatch(nav, /childcaresearch\.gov\.mb\.ca/);
  assert.doesNotMatch(footer, /mbChildcare/);
});

test("Parents column keeps product links and omits city hubs", () => {
  const parentTo = FOOTER_PARENTS.map((link) => link.to);
  assert.ok(parentTo.includes("/search"));
  assert.ok(parentTo.includes("/login"));
  assert.ok(parentTo.includes("/parent"));
  assert.ok(parentTo.includes("/benefits"));
  assert.ok(parentTo.includes("/tour-checklist"));
  assert.ok(parentTo.includes("/compare"));
  assert.ok(parentTo.includes("/get-app"));
  assert.ok(FOOTER_PARENTS.some((link) => link.labelKey === "parentSignIn"));
  assert.ok(FOOTER_PARENTS.some((link) => link.labelKey === "saved"));
  assert.ok(FOOTER_PARENTS.some((link) => link.to === "/get-app" && link.labelKey === "rateKidEase"));
  assert.doesNotMatch(nav, /cityHubs/);
  assert.doesNotMatch(nav, /cityHubPath/);
  assert.doesNotMatch(nav, /daycare\/city/);
  assert.match(src("src/routes/index.tsx"), /CITY_HUB_DEFS\.map/);
  assert.match(src("public/sitemap.xml"), /\/daycare\/city\/winnipeg/);
});

test("Daycares and KidEase columns link Find daycare jobs; KidEase also links Add jobs at KidEase", () => {
  assert.ok(FOOTER_DAYCARES.some((link) => link.to === "/jobs" && link.labelKey === "findDaycareJobs"));
  assert.ok(FOOTER_KIDEASE.some((link) => link.to === "/jobs" && link.labelKey === "findDaycareJobs"));
  assert.ok(FOOTER_KIDEASE.some((link) => link.to === "/jobs/post" && link.labelKey === "addJobsAtKidEase"));
  assert.ok(!FOOTER_SUPPORT.some((link) => link.to === "/jobs/post"));
  assert.doesNotMatch(footer + nav, /Open Road/i);
  assert.doesNotMatch(footer + nav, /openroad/i);
});

test("footer CSS clusters columns instead of stretching full width", () => {
  assert.match(css, /\.ke-footer-inner \{[\s\S]*?max-width: 56rem;/);
  assert.match(css, /grid-template-columns: 1fr 1fr;/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /gap: 3rem 4rem/);
});

test("EN footer labels sort alphabetically in every column", () => {
  assert.deepEqual(labels(FOOTER_PARENTS, "en"), [
    "Childcare Benefits Program",
    "Compare",
    "Get the app",
    "Parent desk",
    "Parent Sign In",
    "Rate KidEase",
    "Saved",
    "Search",
    "Tour checklist",
  ]);
  assert.deepEqual(labels(FOOTER_DAYCARES, "en"), [
    "Claim your daycare",
    "Daycare desk",
    "Daycare requirements",
    "Daycare Sign In",
    "Find daycare jobs",
    "How we verify listings",
  ]);
  assert.deepEqual(labels(FOOTER_KIDEASE, "en"), ["Add jobs at KidEase", "Find daycare jobs"]);
  assert.deepEqual(labels(FOOTER_SUPPORT, "en"), [
    "About",
    "Contact Us",
    "Cookies",
    "Daycare requirements",
    "FAQ",
    "Help Centre",
    "How It Works",
    "How we verify listings",
    "Meet the Team",
    "Privacy",
    "Terms",
    "Unsubscribe",
  ]);
});

test("FR-CA footer labels sort by the French string in every column", () => {
  assert.deepEqual(labels(FOOTER_PARENTS, "fr"), [
    "Comparer",
    "Connexion parent",
    "Espace parent",
    "Évaluer KidEase",
    "Favoris",
    "Liste pour la visite",
    "Programme d’aide à la garde d’enfants",
    "Rechercher",
    "Télécharger l’appli",
  ]);
  assert.deepEqual(labels(FOOTER_DAYCARES, "fr"), [
    "Comment nous vérifions les fiches",
    "Connexion garderie",
    "Espace garderie",
    "Exigences pour les garderies",
    "Réclamez votre garderie",
    "Trouver des emplois en garderie",
  ]);
  assert.deepEqual(labels(FOOTER_KIDEASE, "fr"), [
    "Afficher des postes sur KidEase",
    "Trouver des emplois en garderie",
  ]);
  assert.deepEqual(labels(FOOTER_SUPPORT, "fr"), [
    "À propos",
    "Centre d’aide",
    "Comment ça fonctionne",
    "Comment nous vérifions les fiches",
    "Conditions",
    "Confidentialité",
    "Exigences pour les garderies",
    "FAQ",
    "L’équipe",
    "Nous joindre",
    "Se désabonner",
    "Témoins",
  ]);
});

test("footer does not drop destinations when columns are renamed and reordered", () => {
  const all = Object.values(FOOTER_COLUMNS).flatMap(destinations);
  for (const dest of [
    "/search|{}|bare",
    '/login|{"role":"parent","desk":"parent","intent":"in","next":"/parent"}|bare',
    "/parent|{}|bare",
    "/benefits|{}|bare",
    "/tour-checklist|{}|bare",
    "/compare|{}|bare",
    '/parent|{"tab":"saved"}|bare',
    "/get-app|{}|bare",
    "/claim|{}|bare",
    '/login|{"role":"provider","desk":"director","intent":"in","next":"/provider"}|bare',
    "/provider|{}|bare",
    "/verify|{}|bare",
    "/daycare-requirements|{}|bare",
    "/jobs|{}|paired",
    "/jobs/post|{}|paired",
    "/help|{}|paired",
    "/contact|{}|paired",
    "/faq|{}|paired",
    "/how-it-works|{}|paired",
    "/about|{}|paired",
    "/team|{}|bare",
    "/privacy|{}|paired",
    "/terms|{}|paired",
    "/cookies|{}|paired",
    "/unsubscribe|{}|bare",
  ]) {
    assert.ok(all.includes(dest), `missing ${dest}`);
  }
  assert.equal(FOOTER_PARENTS.filter((link) => link.to === "/get-app").length, 2);
});
