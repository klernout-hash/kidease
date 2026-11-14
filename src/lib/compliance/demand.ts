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

type DemandReportContext = { mode: PackMode; province: string; quarter: string | null };
export type DemandReportData = DemandReportContext & (
  | { enabled: false; status: "off"; rows: [] }
  | { enabled: true; status: "ready"; rows: ReturnType<typeof demandReport>["rows"] }
  | { enabled: true; status: "unavailable" }
);

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

function suppressDemand(rows: Array<{ area: string; ageKey: string; n: number }>) {
  return suppressRows(rows, K_ANONYMITY).map((row) =>
    row.suppressed ? { area: "hidden", ageKey: "hidden", n: null, suppressed: true } : row,
  );
}

export function demandReport(rows: readonly DemandCell[], province: string) {
  const code = province.trim().toUpperCase();
  const scoped = rows
    .filter((row) => row.province.trim().toUpperCase() === code)
    .map((row) => ({
      area: row.area,
      ageKey: row.ageKey,
      n: Math.max(0, Math.floor(row.n)),
    }));
  let hidden = suppressDemand(scoped);
  const visible = hidden.some((row) => !row.suppressed && (row.n ?? 0) >= K_ANONYMITY);
  if (!visible && scoped.length) {
    const byAge = new Map<string, { area: string; ageKey: string; n: number }>();
    for (const row of scoped) {
      const found = byAge.get(row.ageKey) ?? { area: code, ageKey: row.ageKey, n: 0 };
      found.n += row.n;
      byAge.set(row.ageKey, found);
    }
    hidden = suppressDemand([...byAge.values()]);
  }
  return { province: code, k: K_ANONYMITY, rows: hidden };
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
      title: "Inscriptions aux listes d’attente",
      why: "Ce rapport compte les inscriptions marquées « en attente » dans KidEase, par ville de la garderie et groupe d’âge choisi. Un même compte peut figurer sur plusieurs listes. Ce n’est pas un décompte d’enfants ou de familles distincts. Les inscriptions ne se limitent pas au trimestre affiché. Certains résultats peuvent être masqués ou regroupés pour protéger la vie privée.",
      next: "Voir les inscriptions",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint.",
      practice: "Mode pratique : le rapport est écrit, pas envoyé.",
      empty: "Aucun nombre d’inscriptions à afficher. Certains résultats peuvent être masqués pour protéger la vie privée.",
      unavailable: "Le rapport n’a pas pu être chargé. Réessayez dans un instant.",
      retry: "Réessayer",
      retrying: "Nouvel essai…",
    };
  }
  return {
    what: "KidEase for your province",
    title: "Daycare waitlist entries",
    why: "Counts KidEase waitlist entries marked waiting, grouped by the daycare’s city and selected age group. The same account can appear on several lists. These are not unique child or family counts. Entries are not limited to the displayed quarter. Some results may be hidden or combined for privacy.",
    next: "View waitlist entries",
    help: "Help",
    home: "Home",
    off: "This tool is off.",
    practice: "Practice mode: the report is written down, not sent.",
    empty: "No waitlist counts to show. Some results may be hidden for privacy.",
    unavailable: "The report could not be loaded. Try again in a moment.",
    retry: "Try again",
    retrying: "Trying again…",
  };
}
