/**
 * Canonical licensed facility types for Explore and listings.
 *
 * Manitoba ELCC publishes Facility Type Centre / Nursery / Home. KidEase only
 * assigns Nursery or Home from real catalogue amenities (`nursery`, `home`)
 * that seed scripts copy from that registry class (or an equivalent home tag).
 * Untyped rows stay Centre with an admin-visible gap — never a name guess.
 */

export const FACILITY_TYPES = ["centre", "nursery", "home"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const FACILITY_TYPE_SLUGS = FACILITY_TYPES;
export type FacilityTypeSource = "amenity" | "fallback";

/** Conservative name tokens for the admin gap only. Never used to assign type. */
const HOME_NAME_HINT =
  /\b(home daycare|family day\s?home|day\s?home|in[-\s]home(?:\s+child)?(?:\s+care)?)\b/i;
const NURSERY_NAME_HINT = /\bnursery school\b/i;

export function isFacilityType(value: string): value is FacilityType {
  return (FACILITY_TYPES as readonly string[]).includes(value);
}

function amenityKeys(amenities: string): Set<string> {
  return new Set(
    amenities
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function facilityTypeNameHint(name: string): FacilityType | null {
  const raw = String(name || "").trim();
  if (!raw) return null;
  if (HOME_NAME_HINT.test(raw)) return "home";
  if (NURSERY_NAME_HINT.test(raw)) return "nursery";
  return null;
}

export type FacilityTypeClass = {
  type: FacilityType;
  source: FacilityTypeSource;
  nameHint: FacilityType | null;
  /** True when we had to default to Centre, or a name hint disagrees with the amenity class. */
  gap: boolean;
};

export function classifyFacilityType(item: {
  amenities?: string | null;
  name?: string | null;
}): FacilityTypeClass {
  const keys = amenityKeys(item.amenities || "");
  const nameHint = facilityTypeNameHint(item.name || "");
  if (keys.has("home")) {
    return {
      type: "home",
      source: "amenity",
      nameHint,
      gap: Boolean(nameHint && nameHint !== "home"),
    };
  }
  if (keys.has("nursery")) {
    return {
      type: "nursery",
      source: "amenity",
      nameHint,
      gap: Boolean(nameHint && nameHint !== "nursery"),
    };
  }
  return {
    type: "centre",
    source: "fallback",
    nameHint,
    gap: true,
  };
}

export function listingFacilityType(item: {
  amenities?: string | null;
  name?: string | null;
}): FacilityType {
  return classifyFacilityType(item).type;
}

export function matchesFacilityType(
  item: { amenities?: string | null; name?: string | null },
  type: FacilityType,
): boolean {
  return classifyFacilityType(item).type === type;
}

export function facilityTypeNoun(type: FacilityType, locale: "en" | "fr" = "en"): string {
  if (locale === "fr") {
    if (type === "nursery") return "nursery";
    if (type === "home") return "milieu familial";
    return "centre";
  }
  if (type === "nursery") return "nursery";
  if (type === "home") return "home";
  return "centre";
}

export function facilityTypeTagline(
  type: FacilityType,
  city: string,
  province: string,
  locale: "en" | "fr" = "en",
): string {
  const place = city ? `${city}, ${province}` : province;
  if (locale === "fr") {
    if (type === "nursery") {
      return city ? `Nursery permise à ${place}.` : `Nursery permise, ${place}.`;
    }
    if (type === "home") {
      return city ? `Milieu familial permis à ${place}.` : `Milieu familial permis, ${place}.`;
    }
    return city ? `Centre permis à ${place}.` : `Centre permis, ${place}.`;
  }
  if (type === "nursery") {
    return city ? `Licensed nursery in ${place}.` : `Licensed nursery, ${place}.`;
  }
  if (type === "home") {
    return city ? `Licensed home in ${place}.` : `Licensed home, ${place}.`;
  }
  return city ? `Licensed centre in ${place}.` : `Licensed centre, ${place}.`;
}

export function isGenericCentreTagline(tag: string, city: string, province: string): boolean {
  const raw = String(tag || "").trim();
  if (!raw) return true;
  const en = city ? `Licensed centre in ${city}, ${province}.` : `Licensed centre, ${province}.`;
  const fr = city ? `Centre permis à ${city}, ${province}.` : `Centre permis, ${province}.`;
  return raw === en || raw === fr || /^Licensed centre in /i.test(raw) || /^Centre permis à /i.test(raw);
}

export function facilityTypeSeoKind(type: FacilityType, locale: "en" | "fr" = "en"): string {
  if (locale === "fr") {
    if (type === "nursery") return "Nursery permise";
    if (type === "home") return "Garderie en milieu familial";
    return "Centre permis";
  }
  if (type === "nursery") return "Licensed nursery";
  if (type === "home") return "Licensed home";
  return "Licensed centre";
}
