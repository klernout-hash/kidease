/**
 * Anonymized waitlist demand. Cells under 5 are hidden.
 * Uses the existing small-cell rule so a neighbour cell is hidden too
 * when one small cell could be worked out from the total.
 */

import type { EnvMap } from "../flags.ts";
import { suppressRows, K_ANONYMITY } from "../gov/k-anonymity.ts";
import { modeFor, type PackMode } from "./mode.ts";

export const DEMAND_FLAG = "FEATURE_DEMAND_REPORTS";
export const DEMAND_LIVE_FLAG = "FEATURE_DEMAND_REPORTS_LIVE";

export type DemandCell = {
  province: string;
  area: string;
  ageKey: string;
  n: number;
};

export function demandMode(env: EnvMap): PackMode {
  return modeFor(DEMAND_FLAG, env);
}

export function quarterKey(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const month = Number(day.slice(5, 7));
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${day.slice(0, 4)}-Q${quarter}`;
}

/** First week of January, April, July, and October. */
export function quarterReportDue(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return [1, 4, 7, 10].includes(month) && date <= 7;
}

export function normalizeFsa(postal: string): string | null {
  const compact = postal.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fsa = compact.slice(0, 3);
  return /^[A-Z][0-9][A-Z]$/.test(fsa) ? fsa : null;
}

export function demandReport(rows: readonly DemandCell[], province: string) {
  const scoped = rows
    .filter((row) => row.province.trim().toUpperCase() === province.trim().toUpperCase())
    .map((row) => ({
      area: row.area,
      ageKey: row.ageKey,
      n: Math.max(0, Math.floor(row.n)),
    }));
  const hidden = suppressRows(scoped, K_ANONYMITY).map((row) =>
    row.suppressed ? { area: "hidden", ageKey: "hidden", n: null, suppressed: true } : row,
  );
  return { province: province.trim().toUpperCase(), k: K_ANONYMITY, rows: hidden };
}

export function demandDelivery(mode: PackMode, due: boolean): "skip" | "log" | "send" {
  if (mode === "off" || !due) return "skip";
  if (mode === "dry_run") return "log";
  return "send";
}

export function demandCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour votre province",
      why: "Voyez la demande de places par secteur et par âge. Les petits groupes sont cachés.",
      next: "Voir le trimestre",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint.",
      practice: "Mode pratique : le rapport est écrit, pas envoyé.",
      empty: "Pas assez de demandes pour afficher un chiffre.",
    };
  }
  return {
    what: "KidEase for your province",
    why: "See waitlist demand by area and age. Small groups are hidden.",
    next: "See this quarter",
    help: "Help",
    home: "Home",
    off: "This tool is off.",
    practice: "Practice mode: the report is written down, not sent.",
    empty: "There are not enough requests to show a number.",
  };
}
