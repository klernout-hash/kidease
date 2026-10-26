import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { hreflangLinks } from "../src/lib/locale-path.ts";
import {
  GEO_FRENCH_REGIONS,
  decideVisitorLocale,
  localeChoiceSetCookie,
  localeRedirectHeaders,
  localeRedirectTarget,
  readLocaleCookie,
} from "../src/lib/locale-geo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const document = {
  method: "GET",
  accept: "text/html",
  secFetchDest: "document",
};

test("Quebec defaults to French and a non-QC province stays English", () => {
  assert.equal(decideVisitorLocale({ country: "CA", region: "QC" }).locale, "fr");
  assert.equal(decideVisitorLocale({ country: "CA", region: "QC" }).source, "geo");
  assert.equal(decideVisitorLocale({ country: "ca", region: "qc" }).locale, "fr");
  assert.equal(decideVisitorLocale({ country: "CA", region: "CA-QC" }).locale, "fr");
  assert.equal(decideVisitorLocale({ country: "CA", region: "Quebec" }).locale, "fr");
  assert.equal(decideVisitorLocale({ country: "CA", region: "ON" }).locale, "en");
  assert.equal(decideVisitorLocale({ country: "CA", region: "BC" }).locale, "en");
  assert.equal(decideVisitorLocale({ country: "CA", region: "MB" }).locale, "en");
  assert.equal(decideVisitorLocale({ country: "US", region: "CA" }).locale, "en");
  assert.equal(decideVisitorLocale({ country: "US", region: "NY" }).locale, "en");
  assert.equal(decideVisitorLocale({}).locale, "en");
  assert.equal(decideVisitorLocale({ country: "CA" }).locale, "en");
});

test("Accept-Language does not choose the default", () => {
  assert.equal(
    decideVisitorLocale({ country: "CA", region: "ON", acceptLanguage: "fr-CA,fr;q=0.9,en;q=0.8" }).locale,
    "en",
  );
  assert.equal(
    decideVisitorLocale({ country: "CA", region: "QC", acceptLanguage: "en-US,en;q=0.9" }).locale,
    "fr",
  );
  assert.equal(decideVisitorLocale({ country: "US", region: "WA", acceptLanguage: "fr" }).locale, "en");
  assert.doesNotMatch(src("src/lib/locale-geo.ts"), /accept-language/i);
  assert.doesNotMatch(src("src/lib/locale-choice.ts"), /accept-language/i);
  assert.doesNotMatch(src("src/lib/locale-choice.server.ts"), /accept-language/i);
  assert.doesNotMatch(src("src/lib/locale-choice.server.ts"), /headers\.get\(["']accept-language["']\)/i);
});

test("a saved preference overrides location", () => {
  const cookieEn = decideVisitorLocale({ country: "CA", region: "QC", cookie: "en" });
  assert.equal(cookieEn.locale, "en");
  assert.equal(cookieEn.explicit, true);
  assert.equal(cookieEn.source, "cookie");

  const profileFr = decideVisitorLocale({
    country: "CA",
    region: "ON",
    cookie: "en",
    profileChosen: true,
    profileLocale: "fr",
  });
  assert.equal(profileFr.locale, "fr");
  assert.equal(profileFr.source, "profile");

  const profileEn = decideVisitorLocale({
    country: "CA",
    region: "QC",
    profileChosen: true,
    profileLocale: "en",
  });
  assert.equal(profileEn.locale, "en");
  assert.equal(profileEn.source, "profile");

  // The column default is en. That is not a saved choice, so Quebec still gets French.
  assert.equal(
    decideVisitorLocale({ country: "CA", region: "QC", profileChosen: false, profileLocale: "en" }).locale,
    "fr",
  );
});

test("a manual switch sticks in the cookie and is not replaced by location", () => {
  const fr = localeChoiceSetCookie("fr", true);
  assert.match(fr, /^kidease-locale=fr;/);
  assert.match(fr, /Path=\//);
  assert.match(fr, /Max-Age=31536000/);
  assert.match(fr, /SameSite=Lax/);
  assert.match(fr, /Secure/);
  assert.doesNotMatch(fr, /HttpOnly/i);
  assert.equal(readLocaleCookie(fr), "fr");

  const stuck = decideVisitorLocale({
    cookie: readLocaleCookie(fr),
    country: "CA",
    region: "BC",
    acceptLanguage: "en-CA",
  });
  assert.equal(stuck.locale, "fr");
  assert.equal(stuck.explicit, true);

  const en = localeChoiceSetCookie("en", false);
  assert.equal(readLocaleCookie(en), "en");
  assert.equal(
    decideVisitorLocale({ cookie: readLocaleCookie(en), country: "CA", region: "QC" }).locale,
    "en",
  );
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/", cookie: "en", country: "CA", region: "QC" }),
    null,
  );
  assert.match(src("src/components/language-select.tsx"), /writeLocaleChoiceCookie\(next\)/);
  assert.match(src("src/components/language-select.tsx"), /saveMyLocale\(\{ data: \{ locale: next \} \}\)/);
  assert.match(src("src/lib/server/account-prefs.ts"), /locale_chosen/);
  assert.match(src("migrations/0079_profile_locale_choice.sql"), /locale_chosen/);
});

test("Quebec document hops to French once, and crawlers stay on the URL", () => {
  assert.equal(localeRedirectTarget({ ...document, pathname: "/", country: "CA", region: "QC" }), "/fr");
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/privacy", country: "CA", region: "QC" }),
    "/fr/privacy",
  );
  assert.equal(
    localeRedirectTarget({
      ...document,
      pathname: "/search",
      search: "?q=Montreal",
      country: "CA",
      region: "QC",
    }),
    "/fr/search?q=Montreal",
  );
  assert.equal(localeRedirectTarget({ ...document, pathname: "/fr", country: "CA", region: "QC" }), null);
  assert.equal(localeRedirectTarget({ ...document, pathname: "/", country: "CA", region: "ON" }), null);
  assert.equal(localeRedirectTarget({ ...document, pathname: "/fr", country: "CA", region: "ON" }), null);
  assert.equal(localeRedirectTarget({ ...document, pathname: "/parent", country: "CA", region: "QC" }), null);

  const googlebot = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/", country: "CA", region: "QC", userAgent: googlebot }),
    null,
  );
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/fr", country: "US", region: "CA", userAgent: googlebot }),
    null,
  );

  const hop = localeRedirectTarget({ ...document, pathname: "/", country: "CA", region: "QC" });
  assert.equal(localeRedirectTarget({ ...document, pathname: hop, country: "CA", region: "QC" }), null);
  const headers = localeRedirectHeaders("/fr");
  assert.equal(headers.Location, "/fr");
  assert.match(headers["Cache-Control"], /no-store/);

  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/fr/privacy", cookie: "en", country: "CA", region: "QC" }),
    "/privacy",
  );
  assert.equal(
    localeRedirectTarget({
      ...document,
      pathname: "/privacy",
      country: "US",
      region: "NY",
      profileChosen: true,
      profileLocale: "fr",
    }),
    "/fr/privacy",
  );
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/", country: "CA", region: "QC", profileUnreadable: true }),
    null,
  );
});

test("New Brunswick stays English unless the region list includes it", () => {
  assert.deepEqual([...GEO_FRENCH_REGIONS], ["QC"]);
  assert.equal(decideVisitorLocale({ country: "CA", region: "NB" }).locale, "en");
  assert.equal(decideVisitorLocale({ country: "CA", region: "NB", frenchRegions: ["QC", "NB"] }).locale, "fr");
  assert.match(src("src/lib/locale-geo.ts"), /Add "NB"/);
});

test("hreflang stays en, fr, and x-default, and the switcher stays on the page", () => {
  const home = hreflangLinks("/");
  assert.deepEqual(
    home.map((link) => link.hrefLang),
    ["en", "fr", "x-default"],
  );
  assert.equal(home.find((link) => link.hrefLang === "x-default")?.href, "https://www.kidease.ca/");
  assert.match(src("src/components/site-footer.tsx"), /<LanguageSelect/);
  assert.match(src("src/components/nav-drawer.tsx"), /<LanguageSelect/);
  assert.match(src("src/start.ts"), /localeDocumentDecision/);
  assert.match(src("docs/i18n.md"), /x-vercel-ip-country/);
  assert.match(src("docs/i18n.md"), /catalogue \/ user-provided copy stay English/);
});
