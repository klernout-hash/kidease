import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { copy } from "../src/lib/copy.ts";
import { FOUNDING_PAGE } from "../src/lib/founding-period.ts";
import { localePath } from "../src/lib/locale-path.ts";
import { provinceAbbrev, provinceLocativeFr } from "../src/lib/province-phrase.ts";
import { formatPlanCad } from "../src/lib/upgrade-plans.ts";
import { formatCount } from "../src/lib/utils.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("French province phrases and abbreviations", () => {
  assert.equal(provinceLocativeFr("QC"), "au Québec");
  assert.equal(provinceLocativeFr("MB"), "au Manitoba");
  assert.equal(provinceLocativeFr("NB"), "au Nouveau-Brunswick");
  assert.equal(provinceLocativeFr("YT"), "au Yukon");
  assert.equal(provinceLocativeFr("NU"), "au Nunavut");
  assert.equal(provinceLocativeFr("ON"), "en Ontario");
  assert.equal(provinceLocativeFr("BC"), "en Colombie-Britannique");
  assert.equal(provinceLocativeFr("NS"), "en Nouvelle-Écosse");
  assert.equal(provinceLocativeFr("PE"), "à l’Île-du-Prince-Édouard");
  assert.equal(provinceLocativeFr("NL"), "à Terre-Neuve-et-Labrador");
  assert.equal(provinceLocativeFr("NT"), "dans les Territoires du Nord-Ouest");
  assert.equal(provinceAbbrev("BC", "fr"), "C.-B.");
  assert.equal(provinceAbbrev("NS", "fr"), "N.-É.");
  assert.equal(provinceAbbrev("QC", "en"), "QC");
});

test("French money, counts, and vacancy path", () => {
  assert.equal(formatPlanCad(0, "fr"), "0\u00a0$");
  assert.equal(formatPlanCad(7.99, "fr"), "7,99\u00a0$");
  assert.match(formatCount(5805, "fr"), /5\s805/);
  assert.equal(localePath("/vacancy-index", "fr"), "/fr/vacancy-index");
  assert.equal(localePath("/claim", "fr"), "/fr/claim");
});

test("French plans copy lists perks and avoids free-forever wording", () => {
  const fr = FOUNDING_PAGE.fr;
  const blob = `${fr.lead} ${fr.parentsBody} ${fr.daycarePill} ${fr.daycareBody}`;
  assert.match(blob, /période fondatrice gratuite/);
  assert.match(fr.parentsBody, /5 centres/);
  assert.doesNotMatch(blob, /toujours|free forever|gratuit pour toujours/i);
  assert.equal(fr.priceUnit, "/mois");
  assert.doesNotMatch(FOUNDING_PAGE.en.lead, /always use for free|stays free|free forever/i);
});

test("French copy translates leftover English labels and spaces colons", () => {
  assert.equal(copy.fr.careNursery, "Prématernelle");
  assert.equal(copy.fr.catNurseries, "Prématernelles");
  assert.equal(copy.fr.deskCurriculum, "Programme éducatif");
  assert.equal(copy.fr.accountBio, "Présentation");
  assert.equal(copy.fr.vacancyIndexSearchProvince, "Chercher {name}");
  assert.match(copy.fr.startDaycareKidEaseT, /Comment KidEase vous aide/);
  assert.match(copy.fr.startDaycareGrants, /ne finance pas votre projet/);
  assert.equal(copy.en.railNursery, "Nursery schools");
  for (const [key, value] of Object.entries(copy.fr)) {
    if (typeof value !== "string") continue;
    assert.doesNotMatch(value, /[^\s]: /, `${key} needs a space before the colon`);
    assert.doesNotMatch(value, /—/, `${key} has an em dash`);
  }
});

test("blocked analytics files do not reload the page", () => {
  const recover = readFileSync(join(root, "public/asset-recover.js"), "utf8");
  assert.match(recover, /function isBlockedAnalytics/);
  assert.match(recover, /vite:preloadError/);
  assert.match(recover, /preventDefault/);
  const boundary = readFileSync(join(root, "src/lib/error-component.tsx"), "utf8");
  assert.match(boundary, /if \(\/posthog\/i\.test\(msg\)\) return false/);
});
