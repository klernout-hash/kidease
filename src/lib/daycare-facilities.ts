/**
 * Facilities a daycare provider can confirm. Nothing here is assumed.
 * Meals stay on the meals section. These are provider reports, not a certification.
 * Room picks use the same ids but are stored on the room, not added to the centre list.
 */

export const FACILITY_CATEGORIES = ["learning", "outdoor", "rest", "hygiene", "comfort", "arrival", "access"] as const;
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

export type DaycareFacility = {
  id: string;
  category: FacilityCategory;
  /** Can be confirmed for one room. Centre-only items stay off the room list. */
  room: boolean;
  en: string;
  fr: string;
};

export const DAYCARE_FACILITIES: readonly DaycareFacility[] = [
  { id: "toys", category: "learning", room: true, en: "Age-appropriate toys", fr: "Jouets adaptés à l'âge" },
  { id: "books", category: "learning", room: true, en: "Books", fr: "Livres" },
  { id: "art-materials", category: "learning", room: true, en: "Art materials", fr: "Matériel d'art" },
  { id: "sensory", category: "learning", room: true, en: "Sensory play", fr: "Jeu sensoriel" },
  { id: "indoor-play", category: "learning", room: true, en: "Indoor play space", fr: "Espace de jeu intérieur" },
  { id: "yard", category: "outdoor", room: false, en: "Fenced yard", fr: "Cour clôturée" },
  { id: "shade", category: "outdoor", room: false, en: "Shade in the yard", fr: "Ombre dans la cour" },
  { id: "outdoor", category: "outdoor", room: false, en: "Outdoor play", fr: "Jeu extérieur" },
  { id: "nap-area", category: "rest", room: true, en: "Nap or rest area", fr: "Coin repos ou sieste" },
  { id: "changing-station", category: "hygiene", room: true, en: "Changing station", fr: "Table à langer" },
  { id: "child-toilets", category: "hygiene", room: true, en: "Child toilets", fr: "Toilettes pour enfants" },
  { id: "handwashing", category: "hygiene", room: true, en: "Handwashing sink", fr: "Évier pour se laver les mains" },
  { id: "heating", category: "comfort", room: false, en: "Heating", fr: "Chauffage" },
  { id: "cooling", category: "comfort", room: false, en: "Cooling", fr: "Climatisation" },
  { id: "stroller-storage", category: "arrival", room: false, en: "Stroller storage", fr: "Rangement pour poussettes" },
  { id: "dropoff-parking", category: "arrival", room: false, en: "Drop-off parking", fr: "Stationnement pour le dépôt" },
  { id: "step-free", category: "access", room: true, en: "Step-free entry", fr: "Entrée sans marche" },
  { id: "wide-opening", category: "access", room: true, en: "Wide doorway", fr: "Porte large" },
  { id: "accessible-washroom", category: "access", room: true, en: "Washroom nearby", fr: "Toilettes à proximité" },
  { id: "visual-supports", category: "access", room: true, en: "Visual supports", fr: "Repères visuels" },
  { id: "quiet-space", category: "access", room: true, en: "Quiet space", fr: "Espace calme" },
] as const;

const BY_ID = new Map(DAYCARE_FACILITIES.map((item) => [item.id, item]));

export const FACILITY_ID_LIST = DAYCARE_FACILITIES.map((item) => item.id);

export function isDaycareFacility(id: string): boolean {
  return BY_ID.has(id);
}

export function facilityById(id: string): DaycareFacility | null {
  return BY_ID.get(id) ?? null;
}

export function facilityLabel(id: string, locale: string): string {
  const item = BY_ID.get(id);
  if (!item) return id;
  return locale === "fr" ? item.fr : item.en;
}

export function categoryLabel(category: FacilityCategory | "all", locale: string): string {
  const fr = locale === "fr";
  if (category === "all") return fr ? "Tout" : "All";
  if (category === "learning") return fr ? "Jeu et apprentissage" : "Learning and play";
  if (category === "outdoor") return fr ? "Extérieur" : "Outdoor";
  if (category === "rest") return fr ? "Repos" : "Rest";
  if (category === "hygiene") return fr ? "Hygiène" : "Hygiene";
  if (category === "comfort") return fr ? "Confort" : "Comfort";
  if (category === "arrival") return fr ? "Arrivée" : "Arrival";
  return fr ? "Accessibilité" : "Accessibility";
}

export function facilitiesForScope(scope: "centre" | "room"): DaycareFacility[] {
  return DAYCARE_FACILITIES.filter((item) => (scope === "room" ? item.room : true));
}

export function filterFacilities(input: {
  scope: "centre" | "room";
  category: FacilityCategory | "all";
  query: string;
}): DaycareFacility[] {
  const q = input.query.trim().toLocaleLowerCase();
  return facilitiesForScope(input.scope).filter((item) => {
    if (input.category !== "all" && item.category !== input.category) return false;
    if (!q) return true;
    return `${item.en} ${item.fr} ${categoryLabel(item.category, "en")} ${categoryLabel(item.category, "fr")}`
      .toLocaleLowerCase()
      .includes(q);
  });
}

/** Add or remove one catalogue id. Unknown ids are ignored. Other saved keys stay. */
export function toggleFacility(keys: readonly string[], id: string, on: boolean): string[] {
  if (!isDaycareFacility(id) || id === "meals") return [...keys];
  if (on) return keys.includes(id) ? [...keys] : [...keys, id];
  return keys.filter((key) => key !== id);
}

export function selectedFacilities(keys: readonly string[], scope: "centre" | "room" = "centre"): DaycareFacility[] {
  const allowed = new Set(facilitiesForScope(scope).map((item) => item.id));
  return DAYCARE_FACILITIES.filter((item) => keys.includes(item.id) && allowed.has(item.id));
}

/** Centre list only. A room selection is not treated as a centre-wide facility. */
export function centreFacilities(centreKeys: readonly string[]): DaycareFacility[] {
  return selectedFacilities(centreKeys, "centre");
}

export function roomFacilities(roomKeys: readonly string[]): DaycareFacility[] {
  return selectedFacilities(roomKeys, "room");
}

export function facilitySummary(keys: readonly string[], locale: string, limit = 3): { labels: string[]; more: number } {
  const selected = centreFacilities(keys);
  return {
    labels: selected.slice(0, limit).map((item) => (locale === "fr" ? item.fr : item.en)),
    more: Math.max(0, selected.length - limit),
  };
}

export const ROOM_AMENITY_IDS = DAYCARE_FACILITIES.filter((item) => item.room && item.category !== "access").map((item) => item.id);
export const ROOM_ACCESS_IDS = DAYCARE_FACILITIES.filter((item) => item.room && item.category === "access").map((item) => item.id);
