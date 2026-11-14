/**
 * One guide per province or territory. Wording and amounts come from the
 * existing official-source start-a-daycare notes. No new figures.
 */
import { START_DAYCARE_PTS, type StartDaycarePt } from "./start-daycare-hub.ts";

export function provincialGuideByCode(code: string | null | undefined): StartDaycarePt | null {
  const key = String(code || "").trim().toLowerCase();
  return START_DAYCARE_PTS.find((pt) => pt.code.toLowerCase() === key) ?? null;
}

export { CANADA_WIDE_CHILD_CARE_URL, CANADA_WIDE_CHILD_CARE_URL_FR, canadaWideChildCareUrl, PROVINCIAL_GUIDE_CODES, provincialGuidePath, provincialGuidePaths } from "./provincial-guide-route.ts";
