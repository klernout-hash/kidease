/**
 * Listing editor sections. Summaries use saved fields only.
 */

import { managedListingPhotos } from "./listing-photo.ts";
import type { Daycare } from "./types.ts";
import { spotTotal } from "./host-calendar.ts";
import { fillCount, hostCopy, type HostCopy } from "./host-listing-copy.ts";

export const CENTRE_SECTIONS = [
  "photos",
  "name",
  "location",
  "ages",
  "fees",
  "programs",
  "languages",
  "meals",
  "amenities",
  "safety",
  "policies",
  "french",
  "promo",
  "values",
  "health",
] as const;

export const GUIDE_SECTIONS = ["dropoff", "bring", "handbook", "contact"] as const;

export type CentreSection = (typeof CENTRE_SECTIONS)[number];
export type GuideSection = (typeof GUIDE_SECTIONS)[number];
export type HostSection = CentreSection | GuideSection;

export type HostParentPart =
  | "facility"
  | "financial"
  | "programs"
  | "meals"
  | "amenities"
  | "safety"
  | "policies"
  | "promo"
  | "values"
  | "french"
  | "skip";

export type FamilyGuide = { dropoff: string; bring: string; handbook: string };

export const EMPTY_GUIDE: FamilyGuide = { dropoff: "", bring: "", handbook: "" };

const SECTION_KEY: Record<HostSection, keyof HostCopy> = {
  photos: "photos",
  name: "nameType",
  location: "locationHours",
  ages: "agesSpots",
  fees: "fees",
  programs: "programs",
  languages: "languages",
  meals: "meals",
  amenities: "amenities",
  safety: "safety",
  policies: "policies",
  french: "french",
  promo: "promo",
  values: "values",
  health: "health",
  dropoff: "dropoff",
  bring: "bring",
  handbook: "handbook",
  contact: "contact",
};

export function sectionTitle(section: HostSection, locale: string): string {
  const copy = hostCopy(locale);
  return copy[SECTION_KEY[section]];
}

/** Age-spot numbers stay on the ages page. Program bands do not repeat them. */
export function parentPartFor(section: HostSection | undefined): HostParentPart {
  if (!section) return "skip";
  if (section === "name") return "facility";
  if (section === "fees") return "financial";
  if (section === "programs") return "programs";
  if (section === "meals") return "meals";
  if (section === "amenities") return "amenities";
  if (section === "safety") return "safety";
  if (section === "policies") return "policies";
  if (section === "promo") return "promo";
  if (section === "values") return "values";
  if (section === "french") return "french";
  return "skip";
}

function clip(value: string | null | undefined, max = 80): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function feeLine(daycare: Daycare): string {
  const fees = [daycare.infantMonthly, daycare.toddlerMonthly, daycare.preschoolMonthly, daycare.partTimeMonthly].filter(
    (n): n is number => typeof n === "number" && n > 0,
  );
  if (!fees.length) return "";
  const low = Math.min(...fees);
  return `$${low}`;
}

export function sectionSummary(section: HostSection, daycare: Daycare, locale: string, guide?: FamilyGuide | null): string {
  const copy = hostCopy(locale);
  const blank = copy.notYet;
  switch (section) {
    case "photos": {
      const n = managedListingPhotos(daycare.photos).length;
      return n ? fillCount(copy.photosCount, n) : blank;
    }
    case "name":
      return clip(daycare.name) || blank;
    case "location":
      return clip([daycare.city, daycare.hours].filter(Boolean).join(" · ")) || blank;
    case "ages":
      return fillCount(copy.spotsCount, spotTotal({
        infant: daycare.spotsInfant,
        toddler: daycare.spotsToddler,
        preschool: daycare.spotsPreschool,
      }));
    case "fees":
      return feeLine(daycare) || (daycare.feeProgram ? clip(daycare.feeProgram) : "") || blank;
    case "programs":
      return daycare.programs?.length
        ? daycare.programs.map((row) => row.band).join(", ")
        : daycare.curriculumTags?.length
          ? daycare.curriculumTags.slice(0, 3).join(", ")
          : blank;
    case "languages": {
      const langs = [...(daycare.staffLanguages ?? []), ...(daycare.culturalPrograms ?? [])];
      return langs.length ? clip(langs.slice(0, 4).join(", ")) : blank;
    }
    case "meals": {
      const meals = daycare.financial?.meals || String(daycare.amenities || "").split(",").includes("meals");
      return meals ? copy.meals : blank;
    }
    case "amenities": {
      const keys = String(daycare.amenities || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      return keys.length ? clip(keys.slice(0, 3).join(", ")) : blank;
    }
    case "safety":
      return clip(daycare.licenseNumber) || (daycare.safetyFeatures?.length ? daycare.safetyFeatures.slice(0, 2).join(", ") : "") || blank;
    case "policies": {
      const bits = [...(daycare.scheduleOptions ?? []), daycare.openingWindow || ""].filter(Boolean);
      return bits.length ? bits.join(", ") : blank;
    }
    case "french":
      return clip(daycare.descriptionFr) || blank;
    case "promo":
      return clip(daycare.promoText || daycare.tagline) || blank;
    case "values":
      return clip(daycare.valuesNote) || blank;
    case "health":
      return daycare.verified ? copy.health : blank;
    case "dropoff":
      return clip(guide?.dropoff || daycare.hours) || blank;
    case "bring":
      return clip(guide?.bring) || blank;
    case "handbook":
      return clip(guide?.handbook) || blank;
    case "contact":
      return clip([daycare.phone, daycare.contactEmail].filter(Boolean).join(" · ")) || blank;
    default:
      return blank;
  }
}
