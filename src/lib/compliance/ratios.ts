/**
 * Staff-to-child checks. Pure: callers pass counts, never names.
 * Ontario and Alberta rows cite the regulation. Other rows are placeholders.
 */

import type { EnvMap } from "../flags.ts";
import { modeFor, smsPlan, type PackMode } from "./mode.ts";

export const RATIO_FLAG = "FEATURE_RATIO_MONITOR";
export const RATIO_LIVE_FLAG = "FEATURE_RATIO_MONITOR_LIVE";

export type RatioBand = {
  province: string;
  ageKey: string;
  minMonths: number;
  maxMonths: number;
  staffPerBlock: number;
  childrenPerBlock: number;
  maxGroup: number;
  verified: boolean;
  source: string;
};

const ON_SOURCE =
  "O. Reg. 137/15 Schedule 1, as summarized in the Ontario Child Care Centre Licensing Manual, Part 3. Infant is 3 staff for up to 10 children. https://www.ontario.ca/document/child-care-centre-licensing-manual/part-3-ratios-and-group-size";

const AB_SOURCE =
  "Alta. Reg. 143/2008, Schedule 1, s. 27 and s. 27.1. Day care ratios and maximum group size. https://www.canlii.org/en/ab/laws/regu/alta-reg-143-2008/latest/alta-reg-143-2008.html";

export const RATIO_BANDS: readonly RatioBand[] = [
  { province: "ON", ageKey: "infant", minMonths: 0, maxMonths: 18, staffPerBlock: 3, childrenPerBlock: 10, maxGroup: 10, verified: true, source: ON_SOURCE },
  { province: "ON", ageKey: "toddler", minMonths: 18, maxMonths: 30, staffPerBlock: 1, childrenPerBlock: 5, maxGroup: 15, verified: true, source: ON_SOURCE },
  { province: "ON", ageKey: "preschool", minMonths: 30, maxMonths: 72, staffPerBlock: 1, childrenPerBlock: 8, maxGroup: 24, verified: true, source: ON_SOURCE },
  { province: "ON", ageKey: "kindergarten", minMonths: 44, maxMonths: 84, staffPerBlock: 1, childrenPerBlock: 13, maxGroup: 26, verified: true, source: ON_SOURCE },
  { province: "ON", ageKey: "primary", minMonths: 68, maxMonths: 156, staffPerBlock: 1, childrenPerBlock: 15, maxGroup: 30, verified: true, source: ON_SOURCE },
  { province: "AB", ageKey: "infant_under_12", minMonths: 0, maxMonths: 12, staffPerBlock: 1, childrenPerBlock: 3, maxGroup: 6, verified: true, source: AB_SOURCE },
  { province: "AB", ageKey: "infant_12", minMonths: 12, maxMonths: 19, staffPerBlock: 1, childrenPerBlock: 4, maxGroup: 8, verified: true, source: AB_SOURCE },
  { province: "AB", ageKey: "toddler", minMonths: 19, maxMonths: 36, staffPerBlock: 1, childrenPerBlock: 6, maxGroup: 12, verified: true, source: AB_SOURCE },
  { province: "AB", ageKey: "preschool_3", minMonths: 36, maxMonths: 48, staffPerBlock: 1, childrenPerBlock: 8, maxGroup: 16, verified: true, source: AB_SOURCE },
  { province: "AB", ageKey: "preschool_4", minMonths: 48, maxMonths: 72, staffPerBlock: 1, childrenPerBlock: 10, maxGroup: 20, verified: true, source: AB_SOURCE },
  { province: "AB", ageKey: "school", minMonths: 60, maxMonths: 156, staffPerBlock: 1, childrenPerBlock: 15, maxGroup: 30, verified: true, source: AB_SOURCE },
];

const PLACEHOLDER_SOURCE =
  "PLACEHOLDER. These numbers are a planning guide only. Confirm the current regulation before a licensing decision.";

const PLACEHOLDER: Record<string, RatioBand[]> = {
  BC: [
    band("BC", "infant", 4, 12),
    band("BC", "toddler", 4, 12),
    band("BC", "preschool", 8, 25),
    band("BC", "school", 12, 24),
  ],
  SK: [band("SK", "infant", 3, 6), band("SK", "toddler", 5, 10), band("SK", "preschool", 10, 20), band("SK", "school", 15, 30)],
  MB: [band("MB", "infant", 4, 8), band("MB", "toddler", 6, 12), band("MB", "preschool", 8, 16), band("MB", "school", 15, 30)],
  QC: [band("QC", "infant", 5, 10), band("QC", "toddler", 8, 16), band("QC", "preschool", 10, 20), band("QC", "school", 20, 30)],
  NB: [band("NB", "infant", 3, 6), band("NB", "toddler", 5, 10), band("NB", "preschool", 10, 20), band("NB", "school", 15, 30)],
  NS: [band("NS", "infant", 4, 8), band("NS", "toddler", 6, 18), band("NS", "preschool", 8, 24), band("NS", "school", 15, 30)],
  PE: [band("PE", "infant", 3, 6), band("PE", "toddler", 5, 10), band("PE", "preschool", 10, 20), band("PE", "school", 15, 30)],
  NL: [band("NL", "infant", 3, 6), band("NL", "toddler", 5, 10), band("NL", "preschool", 8, 16), band("NL", "school", 15, 30)],
  YT: [band("YT", "infant", 4, 8), band("YT", "toddler", 6, 12), band("YT", "preschool", 8, 16), band("YT", "school", 12, 24)],
  NT: [band("NT", "infant", 3, 6), band("NT", "toddler", 4, 8), band("NT", "preschool", 8, 16), band("NT", "school", 10, 20)],
  NU: [band("NU", "infant", 3, 6), band("NU", "toddler", 5, 10), band("NU", "preschool", 8, 16), band("NU", "school", 12, 24)],
};

function band(province: string, ageKey: string, childrenPerBlock: number, maxGroup: number): RatioBand {
  return {
    province,
    ageKey,
    minMonths: 0,
    maxMonths: 156,
    staffPerBlock: 1,
    childrenPerBlock,
    maxGroup,
    verified: false,
    source: PLACEHOLDER_SOURCE,
  };
}

export function ratioBands(province: string): readonly RatioBand[] {
  const code = province.trim().toUpperCase();
  const cited = RATIO_BANDS.filter((row) => row.province === code);
  if (cited.length) return cited;
  return PLACEHOLDER[code] ?? [];
}

export function ratioMode(env: EnvMap): PackMode {
  return modeFor(RATIO_FLAG, env);
}

export function staffNeeded(children: number, rule: Pick<RatioBand, "staffPerBlock" | "childrenPerBlock">): number {
  const n = Math.max(0, Math.floor(children));
  if (n === 0) return 0;
  return Math.ceil(n / rule.childrenPerBlock) * rule.staffPerBlock;
}

export function ratioCheck(input: {
  province: string;
  ageKey: string;
  children: number;
  staffOnShift: number;
}): {
  ok: boolean;
  staffNeeded: number;
  overGroup: boolean;
  verified: boolean;
  known: boolean;
} {
  const rule = ratioBands(input.province).find((row) => row.ageKey === input.ageKey);
  if (!rule) {
    return { ok: false, staffNeeded: 0, overGroup: false, verified: false, known: false };
  }
  const needed = staffNeeded(input.children, rule);
  const kids = Math.max(0, Math.floor(input.children));
  const overGroup = kids > rule.maxGroup;
  const short = Math.max(0, Math.floor(input.staffOnShift)) < needed;
  return {
    ok: !overGroup && !short,
    staffNeeded: needed,
    overGroup,
    verified: rule.verified,
    known: true,
  };
}

export function directorAlertPlan(mode: PackMode, breach: boolean, caslSms: boolean): {
  inApp: "skip" | "log" | "send";
  sms: "skip" | "log" | "send";
} {
  if (mode === "off" || !breach) return { inApp: "skip", sms: "skip" };
  return {
    inApp: mode === "dry_run" ? "log" : "send",
    sms: smsPlan(mode, caslSms).delivery,
  };
}

export type MonthlyBreach = { province: string; ageKey: string; breaches: number };

/** Monthly report is counts. It has no child name field. */
export function monthlyReport(rows: readonly MonthlyBreach[], province: string): MonthlyBreach[] {
  return rows.filter((row) => row.province.trim().toUpperCase() === province.trim().toUpperCase());
}

export function ratioCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour les garderies",
      why: "Vérifiez le nombre d’adultes et d’enfants dans la salle.",
      next: "Vérifier le ratio",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint.",
      practice: "Mode pratique : l’alerte est écrite, pas envoyée.",
      empty: "Aucune vérification pour l’instant.",
      govWhat: "KidEase pour votre province",
      govWhy: "Voyez le nombre de salles hors ratio. Aucun nom d’enfant.",
    };
  }
  return {
    what: "KidEase for daycares",
    why: "Check how many adults and children are in the room.",
    next: "Check the ratio",
    help: "Help",
    home: "Home",
    off: "This tool is off.",
    practice: "Practice mode: the alert is written down, not sent.",
    empty: "No checks yet.",
    govWhat: "KidEase for your province",
    govWhy: "See how many rooms were out of ratio. No child names.",
  };
}
