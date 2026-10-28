/**
 * At most two short pills on a search card: commute, sibling fit, freshness.
 */

import { detourPill, type CommuteMode, type LatLng, calcDetourMinutes } from "./commute-isochrone.ts";

export type Pill = { id: "detour" | "sibling" | "fresh"; en: string; fr: string };

const BANDS: Record<string, [number, number]> = {
  infant: [0, 18],
  toddler: [18, 36],
  preschool: [36, 72],
  "school-age": [72, 144],
};

export function ageBandFits(ageMinMonths: number, ageMaxMonths: number, band: string): boolean {
  const range = BANDS[band];
  if (!range) return false;
  if (!Number.isFinite(ageMinMonths) || !Number.isFinite(ageMaxMonths) || ageMaxMonths <= ageMinMonths) return false;
  return ageMinMonths < range[1] && ageMaxMonths > range[0];
}

export function siblingFitBadge(input: {
  ageMinMonths: number;
  ageMaxMonths: number;
  bands: string[];
}): boolean {
  const unique = [...new Set(input.bands.filter((band) => BANDS[band]))];
  if (unique.length < 2) return false;
  return unique.every((band) => ageBandFits(input.ageMinMonths, input.ageMaxMonths, band));
}

export function freshnessPill(
  input: { spotsUpdatedAt?: string | null; verified?: boolean },
  now = Date.now(),
): { en: string; fr: string } | null {
  const ts = Date.parse(String(input.spotsUpdatedAt || ""));
  if (Number.isFinite(ts) && ts <= now) {
    const days = Math.floor((now - ts) / (24 * 60 * 60 * 1000));
    if (days <= 45) {
      return { en: `Updated ${days}d ago`, fr: `Mis à jour il y a ${days} j` };
    }
  }
  if (input.verified) return { en: "Verified listing", fr: "Fiche vérifiée" };
  return null;
}

export function pickCardMicroPills(input: {
  locale?: "en" | "fr";
  home?: LatLng | null;
  work?: LatLng | null;
  stop?: LatLng | null;
  mode?: CommuteMode;
  ageMinMonths: number;
  ageMaxMonths: number;
  bands: string[];
  spotsUpdatedAt?: string | null;
  verified?: boolean;
  now?: number;
}): Pill[] {
  const pills: Pill[] = [];
  if (input.home && input.work && input.stop) {
    const minutes = calcDetourMinutes(input.home, input.work, input.stop, input.mode || "drive");
    pills.push({
      id: "detour",
      en: detourPill(minutes, "en"),
      fr: detourPill(minutes, "fr"),
    });
  }
  if (siblingFitBadge(input)) {
    pills.push({ id: "sibling", en: "Sibling fit", fr: "Convient aux frères et sœurs" });
  }
  const fresh = freshnessPill(input, input.now);
  if (fresh) pills.push({ id: "fresh", en: fresh.en, fr: fresh.fr });
  return pills.slice(0, 2);
}
