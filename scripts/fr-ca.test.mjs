import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { frCaEnabled } from "../src/lib/features.ts";
import {
  FR_CA_REGIONS,
  FR_CA_SCREENS,
  applyFrCaDecision,
  fillFrCa,
  frCaChoiceLocked,
  frCaRedirectExtras,
  frCaScreen,
  parseLanguageList,
  savedFrLocale,
} from "../src/lib/fr-ca.ts";
import { decideVisitorLocale, localeRedirectTarget } from "../src/lib/locale-geo.ts";
import { infoQuestionMail, tourRequestMail } from "../src/lib/mail-copy.ts";
import { daycareReplySms, parentMessageSms, parentRequestSms } from "../src/lib/sms-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const on = { FEATURE_FR_CA: "1" };
const off = { FEATURE_FR_CA: "0" };

function headers(map) {
  return { get: (name) => map[name.toLowerCase()] ?? map[name] ?? null };
}

test("FEATURE_FR_CA defaults off and does not change today's locale rules", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FR_CA, false);
  assert.equal(frCaEnabled({}), false);
  assert.equal(frCaEnabled(off), false);
  assert.equal(frCaEnabled(on), true);
  assert.equal(decideVisitorLocale({ country: "CA", region: "NB" }).locale, "en");
  assert.equal(
    decideVisitorLocale({ country: "CA", region: "ON", acceptLanguage: "fr-CA" }).locale,
    "en",
  );
  const extras = frCaRedirectExtras(headers({ "accept-language": "fr-CA,fr;q=0.9" }), off);
  assert.equal(extras.browserFrench, false);
  delete process.env.FEATURE_FR_CA;
  assert.equal(parentRequestSms("Little Fox", "fr"), parentRequestSms("Little Fox"));
});

test("flag on: Quebec and New Brunswick, and the browser or device, choose French", () => {
  assert.deepEqual([...FR_CA_REGIONS], ["QC", "NB"]);
  const nb = applyFrCaDecision(
    { country: "CA", region: "NB" },
    frCaRedirectExtras(headers({}), on),
  );
  assert.equal(nb.locale, "fr");
  assert.equal(nb.source, "geo");

  const ontarioBrowser = applyFrCaDecision(
    { country: "CA", region: "ON" },
    frCaRedirectExtras(headers({ "accept-language": "fr-CA,fr;q=0.9,en;q=0.8" }), on),
  );
  assert.equal(ontarioBrowser.locale, "fr");
  assert.equal(ontarioBrowser.source, "browser");

  const deviceEn = applyFrCaDecision(
    { country: "CA", region: "ON" },
    frCaRedirectExtras(
      headers({ "accept-language": "fr-CA", "x-kidease-device-locale": "en-CA" }),
      on,
    ),
  );
  assert.equal(deviceEn.locale, "en");

  const locked = applyFrCaDecision(
    { country: "CA", region: "ON", cookie: "en" },
    frCaRedirectExtras(headers({ "accept-language": "fr" }), on),
  );
  assert.equal(locked.locale, "en");
  assert.equal(locked.source, "cookie");
  assert.equal(frCaChoiceLocked({ cookie: "en" }), true);
});

test("flag on redirects a paired English URL to French and leaves an explicit English choice", () => {
  const browser = frCaRedirectExtras(headers({ "accept-language": "fr" }), on);
  const target = localeRedirectTarget({
    method: "GET",
    pathname: "/search",
    search: "",
    accept: "text/html",
    country: "CA",
    region: "ON",
    ...browser.redirect,
  });
  assert.equal(target, "/fr/search");

  const savedEn = localeRedirectTarget({
    method: "GET",
    pathname: "/search",
    search: "",
    accept: "text/html",
    country: "CA",
    region: "ON",
    cookie: "en",
    preferredLocale: "fr",
    frenchRegions: FR_CA_REGIONS,
  });
  assert.equal(savedEn, null);

  const nb = localeRedirectTarget({
    method: "GET",
    pathname: "/help",
    search: "",
    accept: "text/html",
    country: "CA",
    region: "NB",
    frenchRegions: FR_CA_REGIONS,
  });
  assert.equal(nb, "/fr/help");
});

test("every parent, daycare, admin, government, email, and SMS string has French", () => {
  for (const [group, rows] of Object.entries(FR_CA_SCREENS)) {
    for (const [key, row] of Object.entries(rows)) {
      assert.ok(row.en.trim(), `${group}.${key} en`);
      assert.ok(row.fr.trim(), `${group}.${key} fr`);
      assert.equal(frCaScreen(group, key, "fr", false), row.en);
      assert.equal(frCaScreen(group, key, "en", true), row.en);
      assert.equal(frCaScreen(group, key, "fr", true), row.fr);
    }
  }
  assert.match(fillFrCa(FR_CA_SCREENS.email.infoDaycare.fr, { who: "Sam", place: "Les Pins" }), /Sam/);
  assert.equal(savedFrLocale({ locale: "fr", locale_chosen: false }), undefined);
  assert.equal(savedFrLocale({ locale: "fr", locale_chosen: true }), "fr");
  assert.equal(parseLanguageList("en-CA,en;q=0.9,fr;q=0.8"), "en");
  assert.equal(parseLanguageList(""), null);
});

test("French email and SMS stay English until the flag is on", () => {
  const en = infoQuestionMail("Sam", "Les Pins");
  const frOff = infoQuestionMail("Sam", "Les Pins", "fr");
  assert.equal(frOff.daycareSubject, en.daycareSubject);
  process.env.FEATURE_FR_CA = "1";
  try {
    const fr = infoQuestionMail("Sam", "Les Pins", "fr");
    assert.match(fr.daycareSubject, /Nouvelle question/);
    assert.match(tourRequestMail("Sam", "Les Pins", "fr").daycareSubject, /visite/);
    assert.match(parentRequestSms("Les Pins", "fr"), /Répondez STOP/);
    assert.match(parentMessageSms("Les Pins", "fr"), /KidEase/);
    assert.match(daycareReplySms("Les Pins", "fr"), /répondu/i);
    assert.equal(parentRequestSms("Les Pins", "en"), parentRequestSms("Les Pins"));
  } finally {
    delete process.env.FEATURE_FR_CA;
  }
});

test("locale files still ignore the browser list unless the French pack reads it", () => {
  const geo = readFileSync(join(root, "src/lib/locale-geo.ts"), "utf8");
  const choice = readFileSync(join(root, "src/lib/locale-choice.ts"), "utf8");
  const server = readFileSync(join(root, "src/lib/locale-choice.server.ts"), "utf8");
  assert.doesNotMatch(geo, /accept-language/i);
  assert.doesNotMatch(choice, /accept-language/i);
  assert.doesNotMatch(server, /accept-language/i);
  assert.match(server, /localeRedirectTarget/);
  assert.match(readFileSync(join(root, "src/lib/fr-ca.ts"), "utf8"), /accept-language/i);
  assert.match(readFileSync(join(root, "src/components/language-select.tsx"), "utf8"), /Français \(Canada\)/);
});
