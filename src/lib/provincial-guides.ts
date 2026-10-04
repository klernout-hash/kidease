/**
 * One guide per province or territory. Wording and amounts come from the
 * existing official-source start-a-daycare notes. No new figures.
 */
import { START_DAYCARE_PTS, type StartDaycarePt } from "./start-daycare-hub.ts";

export const CANADA_WIDE_CHILD_CARE_URL =
  "https://www.canada.ca/en/employment-social-development/programs/early-learning-child-care.html";

export const PROVINCIAL_GUIDE_CODES = START_DAYCARE_PTS.map((pt) => pt.code.toLowerCase());

export function provincialGuidePath(code: string): string {
  return `/guides/${code.toLowerCase()}`;
}

export function provincialGuideByCode(code: string | null | undefined): StartDaycarePt | null {
  const key = String(code || "").trim().toLowerCase();
  return START_DAYCARE_PTS.find((pt) => pt.code.toLowerCase() === key) ?? null;
}

export function provincialGuidePaths(): string[] {
  return ["/guides", ...PROVINCIAL_GUIDE_CODES.map((code) => provincialGuidePath(code))];
}
