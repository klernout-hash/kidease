import { START_DAYCARE_PT_CODES } from "./start-daycare-route.ts";

export const CANADA_WIDE_CHILD_CARE_URL =
  "https://www.canada.ca/en/employment-social-development/programs/early-learning-child-care.html";

export const CANADA_WIDE_CHILD_CARE_URL_FR =
  "https://www.canada.ca/fr/emploi-developpement-social/programmes/apprentissage-garde-jeunes-enfants.html";

export function canadaWideChildCareUrl(locale: "en" | "fr"): string {
  return locale === "fr" ? CANADA_WIDE_CHILD_CARE_URL_FR : CANADA_WIDE_CHILD_CARE_URL;
}

export const PROVINCIAL_GUIDE_CODES = START_DAYCARE_PT_CODES.map((code) => code.toLowerCase());

export function provincialGuidePath(code: string): string {
  return `/guides/${code.toLowerCase()}`;
}

export function provincialGuidePaths(): string[] {
  return ["/guides", ...PROVINCIAL_GUIDE_CODES.map((code) => provincialGuidePath(code))];
}
