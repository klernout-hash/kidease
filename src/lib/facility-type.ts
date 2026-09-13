/**
 * Canonical licensed facility types for Explore and listings.
 *
 * Manitoba ELCC classes KidEase lists:
 *   child_care_centre · family_home · group_home · nursery_preschool · school_age
 *
 * A type is assigned only from the provider `facility_type` column or real
 * catalogue amenities (`home`, `group-home`, `nursery`, `in-school`). Names
 * never assign. Legacy centre/home/nursery/school enums (and empty US-style
 * aliases) map here — they are never shown as filter chips.
 */

export const FACILITY_TYPES = [
  "child_care_centre",
  "family_home",
  "group_home",
  "nursery_preschool",
  "school_age",
] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const FACILITY_TYPE_SLUGS = FACILITY_TYPES;
export type FacilityTypeSource = "amenity" | "column" | "fallback";

/** Legacy Canada slugs + US-style aliases. Mapped on read; never listed as chips. */
export const FACILITY_TYPE_ALIASES: Record<string, FacilityType> = {
  centre: "child_care_centre",
  center: "child_care_centre",
  daycare: "child_care_centre",
  daycare_center: "child_care_centre",
  daycare_centre: "child_care_centre",
  home: "family_home",
  family_child_care: "family_home",
  fcc: "family_home",
  nursery: "nursery_preschool",
  preschool: "nursery_preschool",
  nursery_school: "nursery_preschool",
  school: "school_age",
  school_based: "school_age",
  after_school: "school_age",
  before_after: "school_age",
  group_family: "group_home",
  group_family_home: "group_home",
  group_child_care: "group_home",
};

/** US-style aliases we accept on read but never surface as empty filter chips. */
export const US_FACILITY_ALIASES = [
  "center",
  "daycare",
  "daycare_center",
  "family_child_care",
  "fcc",
  "preschool",
  "after_school",
  "group_family",
] as const;

const HOME_BASED: ReadonlySet<FacilityType> = new Set(["family_home", "group_home"]);

/** Conservative name tokens for the admin gap only. Never used to assign type. */
const GROUP_HOME_NAME_HINT = /\b(group (?:family )?(?:child care )?home|group family)\b/i;
const HOME_NAME_HINT =
  /\b(home daycare|family day\s?home|day\s?home|in[-\s]home(?:\s+child)?(?:\s+care)?|family child care)\b/i;
const NURSERY_NAME_HINT = /\b(nursery school|preschool)\b/i;
const SCHOOL_AGE_NAME_HINT = /\b(school[-\s]?age|before[-\s]?and[-\s]?after|before[-\s]?after)\b/i;

export function isFacilityType(value: string): value is FacilityType {
  return (FACILITY_TYPES as readonly string[]).includes(value);
}

export function normalizeFacilityType(value: unknown): FacilityType | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (isFacilityType(raw)) return raw;
  return FACILITY_TYPE_ALIASES[raw] ?? null;
}

export function isHomeBasedFacility(type: FacilityType): boolean {
  return HOME_BASED.has(type);
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
  if (GROUP_HOME_NAME_HINT.test(raw)) return "group_home";
  if (HOME_NAME_HINT.test(raw)) return "family_home";
  if (NURSERY_NAME_HINT.test(raw)) return "nursery_preschool";
  if (SCHOOL_AGE_NAME_HINT.test(raw)) return "school_age";
  return null;
}

export type FacilityTypeClass = {
  type: FacilityType;
  source: FacilityTypeSource;
  nameHint: FacilityType | null;
  /** True when we had to default to Centre, or a name hint disagrees with the amenity class. */
  gap: boolean;
};

function amenityClass(keys: Set<string>): { type: FacilityType; source: FacilityTypeSource } | null {
  if (keys.has("group-home")) return { type: "group_home", source: "amenity" };
  if (keys.has("home")) return { type: "family_home", source: "amenity" };
  if (keys.has("nursery")) return { type: "nursery_preschool", source: "amenity" };
  if (keys.has("in-school")) return { type: "school_age", source: "amenity" };
  return null;
}

export function classifyFacilityType(item: {
  amenities?: string | null;
  name?: string | null;
  facilityType?: string | null;
}): FacilityTypeClass {
  const keys = amenityKeys(item.amenities || "");
  const nameHint = facilityTypeNameHint(item.name || "");
  const column = normalizeFacilityType(item.facilityType);
  if (column) {
    return {
      type: column,
      source: "column",
      nameHint,
      gap: Boolean(nameHint && nameHint !== column && column !== "school_age"),
    };
  }
  const fromAmenity = amenityClass(keys);
  if (fromAmenity) {
    return {
      type: fromAmenity.type,
      source: fromAmenity.source,
      nameHint,
      gap: Boolean(nameHint && nameHint !== fromAmenity.type),
    };
  }
  return {
    type: "child_care_centre",
    source: "fallback",
    nameHint,
    gap: true,
  };
}

export function listingFacilityType(item: {
  amenities?: string | null;
  name?: string | null;
  facilityType?: string | null;
}): FacilityType {
  return classifyFacilityType(item).type;
}

export function matchesFacilityType(
  item: { amenities?: string | null; name?: string | null; facilityType?: string | null },
  type: string,
): boolean {
  const want = normalizeFacilityType(type);
  return want != null && classifyFacilityType(item).type === want;
}

export function facilityTypeNoun(type: FacilityType | string, locale: "en" | "fr" = "en"): string {
  const kind = normalizeFacilityType(type) ?? "child_care_centre";
  if (locale === "fr") {
    if (kind === "nursery_preschool") return "nursery / prématernelle";
    if (kind === "family_home") return "milieu familial";
    if (kind === "group_home") return "milieu familial de groupe";
    if (kind === "school_age") return "service parascolaire";
    return "centre de garde";
  }
  if (kind === "nursery_preschool") return "nursery school / preschool";
  if (kind === "family_home") return "family child care";
  if (kind === "group_home") return "group child care home";
  if (kind === "school_age") return "school-age";
  return "child care centre";
}

export function facilityTypeTagline(
  type: FacilityType | string,
  city: string,
  province: string,
  locale: "en" | "fr" = "en",
): string {
  const kind = normalizeFacilityType(type) ?? "child_care_centre";
  const place = city ? `${city}, ${province}` : province;
  if (locale === "fr") {
    if (kind === "nursery_preschool") {
      return city ? `Nursery / prématernelle permise à ${place}.` : `Nursery / prématernelle permise, ${place}.`;
    }
    if (kind === "family_home") {
      return city ? `Milieu familial permis à ${place}.` : `Milieu familial permis, ${place}.`;
    }
    if (kind === "group_home") {
      return city
        ? `Milieu familial de groupe permis à ${place}.`
        : `Milieu familial de groupe permis, ${place}.`;
    }
    if (kind === "school_age") {
      return city ? `Service parascolaire à ${place}.` : `Service parascolaire, ${place}.`;
    }
    return city ? `Centre de garde permis à ${place}.` : `Centre de garde permis, ${place}.`;
  }
  if (kind === "nursery_preschool") {
    return city ? `Licensed nursery school in ${place}.` : `Licensed nursery school, ${place}.`;
  }
  if (kind === "family_home") {
    return city ? `Licensed family child care in ${place}.` : `Licensed family child care, ${place}.`;
  }
  if (kind === "group_home") {
    return city ? `Licensed group child care home in ${place}.` : `Licensed group child care home, ${place}.`;
  }
  if (kind === "school_age") {
    return city ? `School-age care in ${place}.` : `School-age care, ${place}.`;
  }
  return city ? `Licensed child care centre in ${place}.` : `Licensed child care centre, ${place}.`;
}

export function isGenericCentreTagline(tag: string, city: string, province: string): boolean {
  const raw = String(tag || "").trim();
  if (!raw) return true;
  const en = city ? `Licensed centre in ${city}, ${province}.` : `Licensed centre, ${province}.`;
  const fr = city ? `Centre permis à ${city}, ${province}.` : `Centre permis, ${province}.`;
  const enLong = city
    ? `Licensed child care centre in ${city}, ${province}.`
    : `Licensed child care centre, ${province}.`;
  const frLong = city
    ? `Centre de garde permis à ${city}, ${province}.`
    : `Centre de garde permis, ${province}.`;
  return (
    raw === en ||
    raw === fr ||
    raw === enLong ||
    raw === frLong ||
    /^Licensed (child care )?centre in /i.test(raw) ||
    /^Centre( de garde)? permis à /i.test(raw)
  );
}

export function facilityTypeSeoKind(type: FacilityType | string, locale: "en" | "fr" = "en"): string {
  const kind = normalizeFacilityType(type) ?? "child_care_centre";
  if (locale === "fr") {
    if (kind === "nursery_preschool") return "Nursery / prématernelle permise";
    if (kind === "family_home") return "Garderie en milieu familial";
    if (kind === "group_home") return "Milieu familial de groupe";
    if (kind === "school_age") return "Service parascolaire";
    return "Centre de garde permis";
  }
  if (kind === "nursery_preschool") return "Licensed nursery school";
  if (kind === "family_home") return "Licensed family child care";
  if (kind === "group_home") return "Licensed group child care home";
  if (kind === "school_age") return "School-age";
  return "Licensed child care centre";
}

/** Short title noun used in listing `<title>` (keeps Centre / Nursery / Home for existing pages). */
export function facilityTypeTitleNoun(type: FacilityType | string): string {
  const kind = normalizeFacilityType(type) ?? "child_care_centre";
  if (kind === "nursery_preschool") return "Nursery";
  if (kind === "family_home") return "Home";
  if (kind === "group_home") return "Group home";
  if (kind === "school_age") return "School-age";
  return "Centre";
}
