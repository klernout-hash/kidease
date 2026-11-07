import { amenityLabel } from "./amenities.ts";

const MEALS = new Set(["meals", "chef", "bread"]);
const PLACE = new Set([
  "outdoor",
  "garden",
  "yard",
  "gym",
  "park",
  "walks",
  "walkable",
  "nature",
  "woodland",
  "mud-kitchen",
  "transit",
  "fob",
  "new-build",
  "urban",
]);
/** Harvested fee words are not offers. The fee section is the only place they belong. */
const FEE_WORDS = new Set(["ten-a-day", "funded", "unfunded", "subsidy", "sliding-scale", "licensed"]);

export type OfferGroup = { id: "care" | "place" | "other"; title: string; items: string[] };

/** Provider-reported amenities, split so meals are not mixed into the feature list. */
export function listingOfferGroups(raw: string | null | undefined, locale: "en" | "fr"): {
  meals: string[];
  groups: OfferGroup[];
} {
  const keys = String(raw || "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key && !FEE_WORDS.has(key));
  const meals: string[] = [];
  const care: string[] = [];
  const place: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const label = amenityLabel(key, locale);
    if (MEALS.has(key)) meals.push(label);
    else if (PLACE.has(key)) place.push(label);
    else if (key === "open-spots") continue;
    else care.push(label);
  }
  const fr = locale === "fr";
  const groups: OfferGroup[] = [];
  if (care.length) groups.push({ id: "care", title: fr ? "Programme" : "Program", items: care });
  if (place.length) groups.push({ id: "place", title: fr ? "Lieu" : "Place", items: place });
  if (other.length) groups.push({ id: "other", title: fr ? "Aussi indiqué" : "Also listed", items: other });
  return { meals, groups };
}
