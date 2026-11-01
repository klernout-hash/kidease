/**
 * Serious occurrence rules. Pure: no database and no secrets.
 * scripts/compliance-incidents.test.mjs loads this file in Node.
 *
 * FEATURE_INCIDENTS off: nothing runs.
 * On, without FEATURE_INCIDENTS_LIVE: practice mode logs what would be
 * sent or escalated and sends nothing.
 * Both on: live. Texts still require a stored CASL SMS opt-in.
 */

import {
  canSeeProvince,
  emailPlan,
  homeProvince,
  modeFor,
  redactLog,
  sameLocalDay,
  smsPlan,
  type ChannelPlan,
  type PackMode,
} from "./mode.ts";
import type { ProvinceCode } from "../gov/places.ts";

export const INCIDENTS_FLAG = "FEATURE_INCIDENTS";
export const INCIDENTS_LIVE_FLAG = "FEATURE_INCIDENTS_LIVE";

export type { PackMode };

export const INCIDENT_KINDS = [
  "injury",
  "allergy",
  "missing_child",
  "abuse_concern",
  "illness",
  "medication_error",
  "unplanned_disruption",
  "death",
  "other",
] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export type DeadlineRow = {
  province: ProvinceCode;
  hours: number;
  verified: boolean;
  source: string;
};

/**
 * Ontario is the published 24-hour rule. Other rows are a KidEase placeholder
 * of 24 hours until that province's filing clock is confirmed. They are not
 * a ministry decision.
 */
export const INCIDENT_DEADLINES: readonly DeadlineRow[] = [
  {
    province: "ON",
    hours: 24,
    verified: true,
    source:
      "O. Reg. 137/15, s. 38(1)(b): report to an inspector or program adviser within 24 hours of the licensee or supervisor becoming aware. https://www.ontario.ca/laws/regulation/150137",
  },
  {
    province: "NS",
    hours: 24,
    verified: true,
    source:
      "Early Learning and Child Care Regulations (N.S.), s. 30B(2)(d): the Department must be advised of a serious incident no later than 24 hours after it occurs. A family-home agency reports within 24 hours of becoming aware, s. 30B(4). Read 1 November 2026. https://novascotia.ca/just/regulations/regs/elcc.htm",
  },
  {
    province: "MB",
    hours: 24,
    verified: false,
    source:
      "PLACEHOLDER. Manitoba licensing (M.R. 17/99, s. 34) requires a report in the form the director sets and does not state an hour. The 24-hour clock is a KidEase practice timer only. Read 1 November 2026.",
  },
  ...(["AB", "BC", "NB", "NL", "NT", "NU", "PE", "QC", "SK", "YT"] as const).map(
    (province): DeadlineRow => ({
      province,
      hours: 24,
      verified: false,
      source:
        "PLACEHOLDER. 24 hours is a KidEase practice clock only. This province's filing deadline was not opened on 1 November 2026.",
    }),
  ),
];

export function incidentsMode(env: import("../flags.ts").EnvMap): PackMode {
  return modeFor(INCIDENTS_FLAG, env);
}

export { canSeeProvince, emailPlan, homeProvince, redactLog, sameLocalDay, smsPlan };

export function isIncidentKind(value: string): value is IncidentKind {
  return (INCIDENT_KINDS as readonly string[]).includes(value);
}

export function deadlineFor(province: string): DeadlineRow | null {
  const code = String(province || "").trim().toUpperCase();
  return INCIDENT_DEADLINES.find((row) => row.province === code) ?? null;
}

export function filingDueAt(awareAt: Date, hours: number): Date {
  return new Date(awareAt.getTime() + hours * 60 * 60 * 1000);
}

export function escalationDecision(input: {
  mode: PackMode;
  awareAt: Date;
  hours: number;
  now: Date;
  filedAt: Date | null;
  escalatedAt: Date | null;
}): { escalate: boolean; delivery: "skip" | "log" | "send"; reason: string } {
  if (input.mode === "off") return { escalate: false, delivery: "skip", reason: "off" };
  if (input.filedAt || input.escalatedAt) return { escalate: false, delivery: "skip", reason: "filed" };
  const due = filingDueAt(input.awareAt, input.hours);
  if (input.now.getTime() < due.getTime()) return { escalate: false, delivery: "skip", reason: "not_due" };
  if (input.mode === "dry_run") return { escalate: true, delivery: "log", reason: "practice" };
  return { escalate: true, delivery: "send", reason: "live" };
}

/** Same-day parent email is a safety notice about their own child. Practice mode only logs it. */
export function parentEmailPlan(input: {
  mode: PackMode;
  occurredAt: Date;
  now: Date;
  timeZone: string;
  hasEmail: boolean;
  alreadySent: boolean;
}): ChannelPlan {
  if (!sameLocalDay(input.occurredAt, input.now, input.timeZone)) {
    return { delivery: "skip", reason: "not_same_day" };
  }
  return emailPlan(input.mode, input.hasEmail, input.alreadySent);
}

export type IncidentAggregate = { kind: IncidentKind; count: number };

/** Counts only. Child labels never enter this result. */
export function incidentAggregate(rows: readonly { kind: string; province: string }[], province: string): IncidentAggregate[] {
  const counts = new Map<IncidentKind, number>();
  for (const row of rows) {
    if (row.province.trim().toUpperCase() !== province.trim().toUpperCase()) continue;
    if (!isIncidentKind(row.kind)) continue;
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }
  return [...counts.entries()].map(([kind, count]) => ({ kind, count }));
}

export function incidentCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour les garderies",
      why: "Notez un événement grave et avisez le bureau de votre province à temps.",
      next: "Enregistrer le rapport",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint. Rien n’est envoyé.",
      practice: "Mode pratique : KidEase écrit ce qui serait envoyé. Rien ne part.",
      abuse: "Si un enfant est en danger, appelez la police ou l’aide à l’enfance. KidEase ne remplace pas cet appel.",
      empty: "Aucun rapport pour l’instant.",
      govWhat: "KidEase pour votre province",
      govWhy: "Voyez les rapports de votre province. Les totaux n’ont pas de nom d’enfant.",
    };
  }
  return {
    what: "KidEase for daycares",
    why: "Record a serious event and file it with your province on time.",
    next: "Save the report",
    help: "Help",
    home: "Home",
    off: "This tool is off. Nothing is sent.",
    practice: "Practice mode: KidEase writes what would be sent. Nothing goes out.",
    abuse: "If a child is in danger, call the police or child protection. KidEase does not replace that call.",
    empty: "No reports yet.",
    govWhat: "KidEase for your province",
    govWhy: "See reports from your province. The totals do not include a child's name.",
  };
}
