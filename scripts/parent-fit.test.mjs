import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  compareParentFit,
  parentFitApplies,
  parentFitScore,
  parseParentFit,
} from "../src/lib/parent-fit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-10-04T15:00:00Z");
const day = 86_400_000;

const home = { lat: 49.8951, lng: -97.1384 };
const work = { lat: 49.895, lng: -97.05 };

function listing(over = {}) {
  return {
    lat: 49.9,
    lng: -97.1,
    agesKnown: true,
    ageMinMonths: 6,
    ageMaxMonths: 60,
    spotsInfant: 0,
    spotsToddler: 1,
    spotsPreschool: 0,
    lastVacancyUpdatedAt: new Date(now - 2 * day).toISOString(),
    infantMonthly: 700,
    toddlerMonthly: 800,
    preschoolMonthly: 750,
    languages: "en, fr",
    subsidy: null,
    ...over,
  };
}

const parent = {
  guest: false,
  childAgeMonths: 18,
  home,
  work,
  radiusKm: 25,
  budgetMonthly: 900,
  languages: ["fr"],
  wantSubsidy: true,
};

test("guests do not get a parent rank", () => {
  assert.equal(parentFitApplies(null), false);
  assert.equal(parentFitApplies({ guest: true }), false);
  assert.equal(parseParentFit({ guest: true, childAgeMonths: 18 }), null);
  assert.equal(parseParentFit(null), null);
  assert.equal(compareParentFit(listing(), listing({ lat: 50 }), null, now), 0);
  assert.equal(compareParentFit(listing(), listing({ lat: 50 }), { guest: true }, now), 0);
});

test("a signed-in parent sees why a centre fits", () => {
  const fit = parentFitScore(
    listing({ subsidy: "ten" }),
    parent,
    now,
  );
  assert.ok(fit.total > 0);
  assert.ok(fit.chips.some((chip) => chip.en === "Takes 18 months" && chip.fr === "Accueille 18 mois"));
  assert.ok(fit.chips.length <= 4);
  const offCorridor = parentFitScore(listing({ lat: 50.4, lng: -96.2, subsidy: "ten" }), parent, now);
  assert.ok(fit.total > offCorridor.total);
  const along = parentFitScore(listing(), { guest: false, home, work }, now);
  assert.ok(along.chips.some((chip) => chip.en === "On your commute" && chip.fr === "Sur votre trajet"));
});

test("unknown ages, fees, and confirms add zero and do not invent a chip", () => {
  const fit = parentFitScore(
    listing({
      agesKnown: false,
      ageMinMonths: 0,
      ageMaxMonths: 0,
      lastVacancyUpdatedAt: null,
      spotsUpdatedAt: null,
      infantMonthly: null,
      toddlerMonthly: null,
      preschoolMonthly: null,
      languages: "",
      subsidy: null,
    }),
    parent,
    now,
  );
  assert.equal(fit.chips.some((chip) => /Takes|budget|French|\$10|Open spot/i.test(chip.en)), false);
  const outside = parentFitScore(listing({ ageMinMonths: 36, ageMaxMonths: 72 }), parent, now);
  assert.equal(outside.chips.some((chip) => chip.en.startsWith("Takes")), false);
});

test("fees count only when a budget is given, and $10 a day needs the data flag", () => {
  const withBudget = parentFitScore(listing({ subsidy: "reduced" }), parent, now);
  const noBudget = parentFitScore(listing({ subsidy: "reduced" }), { ...parent, budgetMonthly: null }, now);
  assert.ok(withBudget.chips.some((chip) => chip.en === "Within your budget"));
  assert.equal(noBudget.chips.some((chip) => /budget/i.test(chip.en)), false);
  assert.ok(withBudget.total > noBudget.total);
  const over = parentFitScore(listing({ infantMonthly: 4000, toddlerMonthly: 4000 }), parent, now);
  assert.equal(over.chips.some((chip) => chip.en === "Within your budget"), false);
  assert.ok(withBudget.total > over.total);
  const ten = parentFitScore(listing({ subsidy: "ten" }), parent, now);
  const reduced = parentFitScore(listing({ subsidy: "reduced" }), parent, now);
  const unasked = parentFitScore(listing({ subsidy: "ten" }), { ...parent, wantSubsidy: false }, now);
  assert.ok(ten.chips.some((chip) => chip.en === "$10 a day"));
  assert.equal(reduced.chips.some((chip) => chip.en === "$10 a day"), false);
  assert.ok(reduced.chips.some((chip) => chip.en === "Reduced fees"));
  assert.equal(unasked.chips.some((chip) => chip.en === "$10 a day"), false);
});

test("an older confirm ranks below a fresh one and never goes negative", () => {
  const fresh = parentFitScore(listing(), parent, now);
  const old = parentFitScore(
    listing({ lastVacancyUpdatedAt: new Date(now - 40 * day).toISOString() }),
    parent,
    now,
  );
  assert.ok(fresh.total > old.total);
  assert.ok(old.total >= 0);
  assert.ok(old.chips.some((chip) => chip.en.startsWith("Confirmed ")));
  const none = parentFitScore(listing({ spotsToddler: 0, spotsInfant: 0, spotsPreschool: 0 }), parent, now);
  assert.equal(none.chips.some((chip) => /spot|Confirmed/i.test(chip.en)), false);
});

test("french and english names match without accents, and paid pins are not read", () => {
  const french = parentFitScore(listing({ languages: "Français" }), parent, now);
  assert.ok(french.chips.some((chip) => chip.en === "French" && chip.fr === "Français"));
  const src = readFileSync(join(root, "src/lib/parent-fit.ts"), "utf8");
  assert.doesNotMatch(src, /priority|featuredCity/);
  const search = readFileSync(join(root, "src/lib/server/daycares.ts"), "utf8");
  assert.match(search, /parseParentFit/);
  assert.match(search, /compareFreshOpenSpots/);
  assert.match(search, /if \(data\.sort === "match"\)/);
});
