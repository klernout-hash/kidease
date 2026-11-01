/**
 * Monthly enrolment and attendance claim checks.
 * Inputs are counts. Child names are not accepted.
 * Province column layouts are placeholders until the official workbook is confirmed.
 */

import type { EnvMap } from "../flags.ts";
import { modeFor, type PackMode } from "./mode.ts";

export const FUNDING_FLAG = "FEATURE_FUNDING_REPORTS";
export const FUNDING_LIVE_FLAG = "FEATURE_FUNDING_REPORTS_LIVE";

export type FundingLine = {
  ageKey: string;
  enrolled: number;
  attendedDays: number;
};

export type FundingFormat = {
  province: string;
  columns: readonly string[];
  verified: boolean;
  source: string;
};

const PLACEHOLDER =
  "PLACEHOLDER. Column names are a KidEase draft. Use the province's current claim workbook before you submit.";

export const FUNDING_FORMATS: readonly FundingFormat[] = [
  ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"].map((province) => ({
    province,
    columns: ["period", "age_group", "enrolled", "attendance_days"] as const,
    verified: false,
    source: PLACEHOLDER,
  })),
].flat();

export function fundingMode(env: EnvMap): PackMode {
  return modeFor(FUNDING_FLAG, env);
}

export function formatFor(province: string): FundingFormat | null {
  const code = province.trim().toUpperCase();
  return FUNDING_FORMATS.find((row) => row.province === code) ?? null;
}

export function mismatchFlags(line: FundingLine): string[] {
  const flags: string[] = [];
  const enrolled = Math.max(0, Math.floor(line.enrolled));
  const days = Math.max(0, Math.floor(line.attendedDays));
  if (enrolled > 0 && days === 0) flags.push("attendance_missing");
  if (days > 0 && enrolled === 0) flags.push("attendance_without_enrolment");
  return flags;
}

export function fundingReport(input: {
  province: string;
  period: string;
  lines: readonly FundingLine[];
}): {
  province: string;
  period: string;
  verified: boolean;
  columns: readonly string[];
  rows: { ageKey: string; enrolled: number; attendedDays: number; flags: string[] }[];
  blocked: boolean;
} {
  const format = formatFor(input.province);
  const rows = input.lines.map((line) => ({
    ageKey: line.ageKey,
    enrolled: Math.max(0, Math.floor(line.enrolled)),
    attendedDays: Math.max(0, Math.floor(line.attendedDays)),
    flags: mismatchFlags(line),
  }));
  return {
    province: input.province.trim().toUpperCase(),
    period: input.period,
    verified: format?.verified ?? false,
    columns: format?.columns ?? [],
    rows,
    blocked: rows.some((row) => row.flags.length > 0),
  };
}

/** Practice mode records the report and does not mark it submitted. */
export function submissionPlan(mode: PackMode, blocked: boolean): "skip" | "log" | "ready" | "blocked" {
  if (mode === "off") return "skip";
  if (blocked) return "blocked";
  if (mode === "dry_run") return "log";
  return "ready";
}

export function fundingCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour les garderies",
      why: "Préparez le rapport mensuel d’inscription et de présence avant de l’envoyer.",
      next: "Vérifier le mois",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint. Rien n’est soumis.",
      practice: "Mode pratique : les écarts sont notés. Rien n’est soumis.",
      empty: "Aucun chiffre pour ce mois.",
      govWhat: "KidEase pour votre province",
      govWhy: "Voyez les totaux et les écarts. Aucun nom d’enfant.",
    };
  }
  return {
    what: "KidEase for daycares",
    why: "Check the monthly enrolment and attendance numbers before you submit them.",
    next: "Check this month",
    help: "Help",
    home: "Home",
    off: "This tool is off. Nothing is submitted.",
    practice: "Practice mode: mismatches are noted. Nothing is submitted.",
    empty: "No numbers for this month.",
    govWhat: "KidEase for your province",
    govWhy: "See totals and mismatches. No child names.",
  };
}
