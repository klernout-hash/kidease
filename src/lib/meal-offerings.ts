/**
 * Provider-confirmed meal details. Missing values stay unknown.
 * An older "meals" or "nut-free" tag is not turned into a new claim.
 */

export const MEAL_SLOTS = ["breakfast", "morning-snack", "lunch", "afternoon-snack", "supper", "evening-snack"] as const;
export const MEAL_DRINKS = ["water", "milk"] as const;
export const MEAL_DIETS = ["vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free"] as const;
export const MEAL_SOURCES = ["on-site", "catered", "packed"] as const;
export const MEAL_PRICES = ["included", "extra", "ask"] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number];
export type MealDrink = (typeof MEAL_DRINKS)[number];
export type MealDiet = (typeof MEAL_DIETS)[number];
export type MealSource = (typeof MEAL_SOURCES)[number];
export type MealPrice = (typeof MEAL_PRICES)[number];
export type MealChoice = boolean | null;

export type MealOfferings = {
  slots: Record<MealSlot, MealChoice>;
  drinks: Record<MealDrink, MealChoice>;
  milkNote: string;
  source: MealSource | null;
  price: MealPrice | null;
  diets: Record<MealDiet, MealChoice>;
  dietNote: string;
  agesNote: string;
  sampleMenu: string;
};

const SLOT_LABEL: Record<MealSlot, { en: string; fr: string; hint: { en: string; fr: string } }> = {
  breakfast: { en: "Breakfast", fr: "Déjeuner", hint: { en: "A morning meal at the centre.", fr: "Un repas du matin au centre." } },
  "morning-snack": { en: "Morning snack", fr: "Collation du matin", hint: { en: "A snack before lunch.", fr: "Une collation avant le dîner." } },
  lunch: { en: "Lunch", fr: "Dîner", hint: { en: "The midday meal.", fr: "Le repas du midi." } },
  "afternoon-snack": { en: "Afternoon snack", fr: "Collation de l'après-midi", hint: { en: "A snack after rest time.", fr: "Une collation après le repos." } },
  supper: { en: "Supper", fr: "Souper", hint: { en: "Only if families stay into the evening.", fr: "Seulement si des familles restent en soirée." } },
  "evening-snack": { en: "Evening snack", fr: "Collation du soir", hint: { en: "Only if you offer evening care.", fr: "Seulement si vous offrez un service en soirée." } },
};

const DRINK_LABEL: Record<MealDrink, { en: string; fr: string; hint: { en: string; fr: string } }> = {
  water: { en: "Water", fr: "Eau", hint: { en: "Drinking water is available.", fr: "De l'eau à boire est offerte." } },
  milk: { en: "Milk or a milk alternative", fr: "Lait ou boisson végétale", hint: { en: "Add a short note if you offer an alternative.", fr: "Ajoutez une courte note si vous offrez une autre boisson." } },
};

const DIET_LABEL: Record<MealDiet, { en: string; fr: string }> = {
  vegetarian: { en: "Vegetarian meals", fr: "Repas végétariens" },
  vegan: { en: "Vegan meals", fr: "Repas végétaliens" },
  halal: { en: "Halal meals", fr: "Repas halal" },
  kosher: { en: "Kosher meals", fr: "Repas casher" },
  "gluten-free": { en: "Gluten-free meals", fr: "Repas sans gluten" },
  "dairy-free": { en: "Dairy-free meals", fr: "Repas sans produits laitiers" },
};

const SOURCE_LABEL: Record<MealSource, { en: string; fr: string }> = {
  "on-site": { en: "Prepared at the centre", fr: "Préparé au centre" },
  catered: { en: "Brought in by a caterer", fr: "Apporté par un traiteur" },
  packed: { en: "Packed from home", fr: "Apporté de la maison" },
};

const PRICE_LABEL: Record<MealPrice, { en: string; fr: string }> = {
  included: { en: "Included in the fee", fr: "Inclus dans les frais" },
  extra: { en: "An extra charge", fr: "Frais en plus" },
  ask: { en: "Ask the centre", fr: "Demander au centre" },
};

function choiceMap<T extends string>(ids: readonly T[]): Record<T, MealChoice> {
  return Object.fromEntries(ids.map((id) => [id, null])) as Record<T, MealChoice>;
}

export function emptyMealOfferings(): MealOfferings {
  return {
    slots: choiceMap(MEAL_SLOTS),
    drinks: choiceMap(MEAL_DRINKS),
    milkNote: "",
    source: null,
    price: null,
    diets: choiceMap(MEAL_DIETS),
    dietNote: "",
    agesNote: "",
    sampleMenu: "",
  };
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").split("\0").join("").replace(/\s+/g, " ").trim().slice(0, max);
}

function asChoice(value: unknown): MealChoice {
  if (value === true || value === false) return value;
  return null;
}

function readChoiceRecord<T extends string>(raw: unknown, ids: readonly T[]): Record<T, MealChoice> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = choiceMap(ids);
  for (const id of ids) out[id] = asChoice(source[id]);
  return out;
}

export function mealLabel(kind: "slot" | "drink" | "diet" | "source" | "price", id: string, locale: string): string {
  const fr = locale === "fr";
  if (kind === "slot" && id in SLOT_LABEL) return fr ? SLOT_LABEL[id as MealSlot].fr : SLOT_LABEL[id as MealSlot].en;
  if (kind === "drink" && id in DRINK_LABEL) return fr ? DRINK_LABEL[id as MealDrink].fr : DRINK_LABEL[id as MealDrink].en;
  if (kind === "diet" && id in DIET_LABEL) return fr ? DIET_LABEL[id as MealDiet].fr : DIET_LABEL[id as MealDiet].en;
  if (kind === "source" && id in SOURCE_LABEL) return fr ? SOURCE_LABEL[id as MealSource].fr : SOURCE_LABEL[id as MealSource].en;
  if (kind === "price" && id in PRICE_LABEL) return fr ? PRICE_LABEL[id as MealPrice].fr : PRICE_LABEL[id as MealPrice].en;
  return id;
}

export function mealHint(kind: "slot" | "drink", id: string, locale: string): string {
  const fr = locale === "fr";
  if (kind === "slot" && id in SLOT_LABEL) return fr ? SLOT_LABEL[id as MealSlot].hint.fr : SLOT_LABEL[id as MealSlot].hint.en;
  if (kind === "drink" && id in DRINK_LABEL) return fr ? DRINK_LABEL[id as MealDrink].hint.fr : DRINK_LABEL[id as MealDrink].hint.en;
  return "";
}

function amenityKeys(amenities: string): string[] {
  return amenities.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
}

/** Saved JSON wins. Legacy diet tags can confirm a diet. Nut-free never becomes a switch. */
export function mealOfferingsFromStored(raw: unknown, amenities = ""): MealOfferings {
  const base = emptyMealOfferings();
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (record && (record.slots || record.drinks || record.diets || record.source || record.price || record.sampleMenu)) {
    return normalizeMealOfferings(record);
  }
  const keys = amenityKeys(amenities);
  if (keys.includes("vegetarian")) base.diets.vegetarian = true;
  if (keys.includes("halal")) base.diets.halal = true;
  if (keys.includes("kosher")) base.diets.kosher = true;
  return base;
}

export function normalizeMealOfferings(raw: unknown): MealOfferings {
  const base = emptyMealOfferings();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const source = String(row.source ?? "");
  const price = String(row.price ?? "");
  return {
    slots: readChoiceRecord(row.slots, MEAL_SLOTS),
    drinks: readChoiceRecord(row.drinks, MEAL_DRINKS),
    milkNote: clip(row.milkNote, 180),
    source: (MEAL_SOURCES as readonly string[]).includes(source) ? (source as MealSource) : null,
    price: (MEAL_PRICES as readonly string[]).includes(price) ? (price as MealPrice) : null,
    diets: readChoiceRecord(row.diets, MEAL_DIETS),
    dietNote: clip(row.dietNote, 280),
    agesNote: clip(row.agesNote, 180),
    sampleMenu: clip(row.sampleMenu, 600),
  };
}

export function mealOfferingsChanged(before: MealOfferings, after: MealOfferings): boolean {
  return JSON.stringify(normalizeMealOfferings(before)) !== JSON.stringify(normalizeMealOfferings(after));
}

/** True only when a meal or drink is confirmed. Unknown does not turn the old meals flag off. */
export function mealsFlagFromOfferings(offerings: MealOfferings, previous: boolean): boolean {
  const choices = [...Object.values(offerings.slots), ...Object.values(offerings.drinks)];
  if (choices.some((choice) => choice === true)) return true;
  if (choices.every((choice) => choice === false)) return false;
  return previous;
}

export type MealPublicLine = { id: string; label: string };

export function publicMealSummary(offerings: MealOfferings, locale: string, legacyMeals: boolean): {
  lines: MealPublicLine[];
  legacyOnly: boolean;
} {
  const lines: MealPublicLine[] = [];
  for (const id of MEAL_SLOTS) {
    if (offerings.slots[id] === true) lines.push({ id, label: mealLabel("slot", id, locale) });
  }
  for (const id of MEAL_DRINKS) {
    if (offerings.drinks[id] === true) lines.push({ id, label: mealLabel("drink", id, locale) });
  }
  if (offerings.source) lines.push({ id: offerings.source, label: mealLabel("source", offerings.source, locale) });
  if (offerings.price) lines.push({ id: offerings.price, label: mealLabel("price", offerings.price, locale) });
  for (const id of MEAL_DIETS) {
    if (offerings.diets[id] === true) lines.push({ id, label: mealLabel("diet", id, locale) });
  }
  return { lines, legacyOnly: lines.length === 0 && legacyMeals };
}

export function hasNutFreeLegacy(amenities: string): boolean {
  return amenityKeys(amenities).includes("nut-free");
}
