/**
 * Append-only audit retention. Practice mode lists rows it would delete
 * and deletes nothing.
 */

import type { EnvMap } from "../flags.ts";
import { modeFor, type PackMode } from "./mode.ts";

export const AUDIT_FLAG = "FEATURE_AUDIT_RETENTION";
export const AUDIT_LIVE_FLAG = "FEATURE_AUDIT_RETENTION_LIVE";

export type RetentionRule = {
  province: string;
  years: number;
  verified: boolean;
  source: string;
};

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    province: "ON",
    years: 3,
    verified: true,
    source:
      "O. Reg. 137/15, s. 82(1): keep a required record for at least three years from the date it is made. https://www.ontario.ca/laws/regulation/150137",
  },
  {
    province: "NS",
    years: 3,
    verified: false,
    source:
      "PLACEHOLDER for this audit log. Early Learning and Child Care Regulations (N.S.), s. 31(4), keep a child's file at least 2 years after withdrawal. That section is the child's file, not this log, so KidEase does not purge on it. Read 1 November 2026. https://novascotia.ca/just/regulations/regs/elcc.htm",
  },
  ...(["AB", "BC", "MB", "NB", "NL", "NT", "NU", "PE", "QC", "SK", "YT"] as const).map((province) => ({
    province,
    years: 3,
    verified: false,
    source: "PLACEHOLDER. Three years matches Ontario's published minimum. This province's schedule was not opened on 1 November 2026. Do not purge on it.",
  })),
];

export function auditMode(env: EnvMap): PackMode {
  return modeFor(AUDIT_FLAG, env);
}

export function retentionFor(province: string): RetentionRule | null {
  const code = province.trim().toUpperCase();
  return RETENTION_RULES.find((row) => row.province === code) ?? null;
}

export function retentionCutoff(years: number, now: Date): Date {
  const copy = new Date(now.getTime());
  copy.setUTCFullYear(copy.getUTCFullYear() - years);
  return copy;
}

export type AuditRow = { id: string; province: string; at: string };

export function purgePlan(
  rows: readonly AuditRow[],
  now: Date,
  mode: PackMode,
): { id: string; action: "would_delete" | "delete" }[] {
  if (mode === "off") return [];
  const action = mode === "live" ? "delete" : "would_delete";
  const out: { id: string; action: "would_delete" | "delete" }[] = [];
  for (const row of rows) {
    const rule = retentionFor(row.province);
    if (!rule) continue;
    const at = Date.parse(row.at);
    if (!Number.isFinite(at)) continue;
    if (at < retentionCutoff(rule.years, now).getTime()) out.push({ id: row.id, action });
  }
  return out;
}

export function auditCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour votre province",
      why: "Voyez qui a ouvert un dossier et combien de temps il est gardé.",
      next: "Voir le journal",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint. Rien n’est effacé.",
      practice: "Mode pratique : les lignes à effacer sont listées. Rien n’est effacé.",
      empty: "Aucune ligne à effacer.",
    };
  }
  return {
    what: "KidEase for your province",
    why: "See who opened a record and how long it is kept.",
    next: "See the log",
    help: "Help",
    home: "Home",
    off: "This tool is off. Nothing is deleted.",
    practice: "Practice mode: rows that would be deleted are listed. Nothing is deleted.",
    empty: "Nothing is ready to delete.",
  };
}
