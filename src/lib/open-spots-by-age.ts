/**
 * Exact open spots by age from the weekly check-in link. No login.
 * Only the listing's own age groups are kept; others are set to 0.
 */

import type { OpenSpotsBand, SpotAge, SpotCounts } from "./open-spots-checkin.ts";

export const MAX_SPOTS_PER_AGE = 99;

export function spotsFromAgeCounts(
  groups: readonly SpotAge[],
  input: Partial<Record<SpotAge, unknown>>,
): { ok: true; spots: SpotCounts; total: number; band: OpenSpotsBand } | { ok: false } {
  if (!groups.length) return { ok: false };
  const spots: SpotCounts = { infant: 0, toddler: 0, preschool: 0 };
  for (const age of groups) {
    const raw = input[age];
    const n = raw === "" || raw == null ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > MAX_SPOTS_PER_AGE) return { ok: false };
    spots[age] = n;
  }
  const total = spots.infant + spots.toddler + spots.preschool;
  const band = Math.min(total, 3) as OpenSpotsBand;
  return { ok: true, spots, total, band };
}

const en = {
  title: "Open spots by age",
  lead: "Enter how many spots are open in each age group. This updates your listing right away.",
  infant: "Infant",
  toddler: "Toddler",
  preschool: "Preschool",
  save: "Save open spots",
  saved: "Open spots saved for each age group.",
  bad: "Use a whole number from 0 to 99.",
};
const fr: typeof en = {
  title: "Places libres par âge",
  lead: "Indiquez le nombre de places libres dans chaque groupe d'âge. Votre fiche est mise à jour tout de suite.",
  infant: "Poupons",
  toddler: "Trottineurs",
  preschool: "Préscolaire",
  save: "Enregistrer les places",
  saved: "Places libres enregistrées pour chaque groupe d'âge.",
  bad: "Utilisez un nombre entier de 0 à 99.",
};

export function spotsByAgeCopy(locale: string): typeof en {
  return locale === "fr" ? fr : en;
}
