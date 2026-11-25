/**
 * "Counts as of …" on the government desk, in local Canada time with a zone
 * label, never raw UTC (#1014 item 6).
 *
 * Zone order: the desk's province (MB → America/Winnipeg), then the
 * browser's zone when it is a real place (not UTC), then America/Winnipeg.
 * The server has no browser zone, so SSR and the first client render agree;
 * the browser zone only applies after mount, and only when the province is
 * unknown (for example "ALL").
 * No app imports, so node tests load this file directly.
 */
import { provinceTimezone } from "../province-timezone.ts";

export const GOV_AS_OF_FALLBACK_ZONE = "America/Winnipeg";

function usableBrowserZone(zone?: string | null): string | null {
  const value = String(zone || "").trim();
  if (!value || /^(etc\/)?(utc|gmt|uct|zulu|universal)$/i.test(value) || value.startsWith("Etc/")) return null;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

export function govAsOfZone(province?: string | null, browserZone?: string | null): string {
  return provinceTimezone(province) ?? usableBrowserZone(browserZone) ?? GOV_AS_OF_FALLBACK_ZONE;
}

/**
 * Zones that stopped changing clocks in 2026. tzdata 2026e has the right UTC offsets, but
 * CLDR/ICU 78 still label them as daylight time (Winnipeg "CDT"/"HAC", Vancouver "PDT",
 * Edmonton "MDT"). After the change, show the official name where there is one
 * (Manitoba Standard Time: MBT / HNM, gov.mb.ca/timechange), otherwise the UTC offset.
 */
const PERMANENT_ZONE_LABELS: Record<string, { from: number; en: string; fr: string }> = {
  "America/Winnipeg": { from: Date.UTC(2026, 10, 1, 7), en: "MBT", fr: "HNM" },
  "America/Vancouver": { from: Date.UTC(2026, 10, 1, 9), en: "UTC−7", fr: "UTC−7" },
  "America/Edmonton": { from: Date.UTC(2026, 10, 1, 8), en: "UTC−6", fr: "UTC−6" },
};

export function govZoneLabel(zone: string, date: Date, locale: "en" | "fr"): string | null {
  const rule = PERMANENT_ZONE_LABELS[zone];
  if (!rule || date.getTime() < rule.from) return null;
  return locale === "fr" ? rule.fr : rule.en;
}

/** "Nov 25, 2026, 4:01 p.m. MBT" / "25 nov. 2026, 16 h 01 HNM". Empty for a bad date. */
export function formatGovAsOf(
  iso: string | null | undefined,
  province: string | null | undefined,
  locale: "en" | "fr",
  browserZone?: string | null,
): string {
  const date = new Date(String(iso || ""));
  if (Number.isNaN(date.getTime())) return "";
  const timeZone = govAsOfZone(province, browserZone);
  // dateStyle/timeStyle cannot be combined with timeZoneName, so spell the parts out.
  const parts = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  const label = govZoneLabel(timeZone, date, locale);
  // formatToParts keeps ICU's narrow no-break spaces; format() output uses plain spaces, so match it.
  return parts
    .map((part) => (part.type === "timeZoneName" && label ? label : part.value))
    .join("")
    .replace(/[\u202f\u00a0]/g, " ");
}
