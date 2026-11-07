import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyMealOfferings,
  hasNutFreeLegacy,
  mealOfferingsFromStored,
  mealsFlagFromOfferings,
  normalizeMealOfferings,
  publicMealSummary,
} from "../src/lib/meal-offerings.ts";

test("a new centre has no meal selections and unknown is not false", () => {
  const empty = emptyMealOfferings();
  assert.equal(empty.slots.lunch, null);
  assert.equal(empty.slots.breakfast, null);
  assert.equal(mealsFlagFromOfferings(empty, true), true);
  assert.equal(mealsFlagFromOfferings(empty, false), false);
  const turnedOff = { ...empty, slots: { ...empty.slots, lunch: false } };
  assert.equal(mealsFlagFromOfferings(turnedOff, true), true);
  const allOff = emptyMealOfferings();
  for (const key of Object.keys(allOff.slots)) allOff.slots[key] = false;
  for (const key of Object.keys(allOff.drinks)) allOff.drinks[key] = false;
  assert.equal(mealsFlagFromOfferings(allOff, true), false);
});

test("legacy diet tags can confirm a diet, and nut-free does not become a claim", () => {
  const fromOld = mealOfferingsFromStored(null, "meals,vegetarian,nut-free,halal");
  assert.equal(fromOld.diets.vegetarian, true);
  assert.equal(fromOld.diets.halal, true);
  assert.equal(fromOld.diets.vegan, null);
  assert.equal(fromOld.slots.lunch, null);
  assert.equal(JSON.stringify(fromOld).includes("nut-free"), false);
  assert.equal(hasNutFreeLegacy("nut-free"), true);
  const injected = normalizeMealOfferings({ diets: { "nut-free": true, vegan: true }, slots: { lunch: true } });
  assert.equal(injected.diets.vegan, true);
  assert.equal(JSON.stringify(injected.diets).includes("nut-free"), false);
});

test("the public meal summary lists only confirmed items", () => {
  const offerings = emptyMealOfferings();
  offerings.slots.lunch = true;
  offerings.price = "included";
  const shown = publicMealSummary(offerings, "fr", false);
  assert.deepEqual(shown.lines.map((line) => line.label), ["Dîner", "Inclus dans les frais"]);
  const none = publicMealSummary(emptyMealOfferings(), "en", true);
  assert.equal(none.lines.length, 0);
  assert.equal(none.legacyOnly, true);
  const unknown = publicMealSummary(emptyMealOfferings(), "en", false);
  assert.equal(unknown.legacyOnly, false);
});
