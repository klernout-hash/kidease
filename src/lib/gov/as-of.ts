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

/** "Nov 25, 2026, 10:01 a.m. CST" / "25 nov. 2026, 10 h 01 HNC". Empty for a bad date. */
export function formatGovAsOf(
  iso: string | null | undefined,
  province: string | null | undefined,
  locale: "en" | "fr",
  browserZone?: string | null,
): string {
  const date = new Date(String(iso || ""));
  if (Number.isNaN(date.getTime())) return "";
  // dateStyle/timeStyle cannot be combined with timeZoneName, so spell the parts out.
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: govAsOfZone(province, browserZone),
    timeZoneName: "short",
  }).format(date);
}
