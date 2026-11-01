/**
 * Staff-to-child checks. Pure: callers pass counts, never names.
 * Ontario and Alberta rows cite the regulation.
 * British Columbia, Saskatchewan, Manitoba, New Brunswick, Nova Scotia,
 * Prince Edward Island, and Yukon rows cite the text read on 1 November 2026.
 * Quebec, Newfoundland and Labrador, the Northwest Territories, and Nunavut
 * stay placeholders because that regulation text was not opened.
 */

import type { EnvMap } from "../flags.ts";
import { modeFor, smsPlan, type PackMode } from "./mode.ts";

export const RATIO_FLAG = "FEATURE_RATIO_MONITOR";
export const RATIO_LIVE_FLAG = "FEATURE_RATIO_MONITOR_LIVE";

export type RatioStep = { upTo: number; staff: number };

export type RatioBand = {
  province: string;
  ageKey: string;
  minMonths: number;
  maxMonths: number;
  staffPerBlock: number;
  childrenPerBlock: number;
  /** 0 means this pass did not confirm a maximum group size. */
  maxGroup: number;
  /** Stepped schedules. When set, staffNeeded uses these rows, not a straight ratio. */
  steps?: readonly RatioStep[];
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

const BC_SOURCE =
  "Child Care Licensing Regulation, B.C. Reg. 332/2007, s. 34 and Schedule E. Read 1 November 2026. https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/332_2007";

const MB_SOURCE =
  "Child Care Regulation, Man. Reg. 62/86, s. 8. Mixed-age table is s. 8(2)(a). Separate-age table is s. 8(2)(b). Nursery schools of four hours or less are s. 8(3). Read 1 November 2026. https://www.canlii.org/en/mb/laws/regu/man-reg-62-86/latest/man-reg-62-86.html";

const SK_SOURCE =
  "The Child Care Regulations, 2015, C-7.31 Reg 1, s. 51(2) and s. 52(4). Age definitions: infant, toddler, preschool child, school-age child. Read 1 November 2026. https://publications.saskatchewan.ca/api/v1/products/73483/formats/82271/download";

const NB_SOURCE =
  "Licensing Regulation, N.B. Reg. 2018-11, under the Early Childhood Services Act, s. 9(1), s. 9(5) and s. 9(5.1). Infant is under 2 (Act, s. 1). A same-age group may not be larger than two educators, except infants, who may require three. Read 1 November 2026. https://laws.gnb.ca/en/document/cr/2018-11";

const NS_SOURCE =
  "Early Learning and Child Care Regulations (N.S.), s. 34(1) and s. 34(3). Infant is under 18 months. Toddler is 18 to 35 months inclusive. Preschooler is 36 months or older and not attending school. Read 1 November 2026. https://novascotia.ca/just/regulations/regs/elcc.htm";

const PE_SOURCE =
  "Early Learning and Child Care Act Regulations (P.E.I.), s. 19(1), indoor column. Maximum group size was not in the section read on 1 November 2026, so maxGroup is 0 and is not enforced. https://www.princeedwardisland.ca/sites/default/files/legislation/e.01g-early_learning_and_child_care_act_regulations.pdf";

const YT_SOURCE =
  "Child Care Centre Program Regulation, Y.O.I.C. 1995/087, s. 5. The Early Learning and Child Care Act, S.Y. 2025, c. 3, was not in force on the statutes table read for the curriculum note. Read 1 November 2026. https://laws.yukon.ca/cms/images/LEGISLATION/SUBORDINATE/1995/1995-0087/1995-0087_1.pdf";

const PLACEHOLDER_SOURCE =
  "PLACEHOLDER. The regulation text was not opened on 1 November 2026. These counts are not a licensing rule.";

const CITED: Record<string, RatioBand[]> = {
  BC: [
    stepped("BC", "under_36", 0, 36, 4, 12, [{ upTo: 4, staff: 1 }, { upTo: 8, staff: 2 }, { upTo: 12, staff: 3 }], BC_SOURCE),
    stepped("BC", "group_30_to_school", 30, 72, 8, 25, [{ upTo: 8, staff: 1 }, { upTo: 16, staff: 2 }, { upTo: 25, staff: 3 }], BC_SOURCE),
    stepped("BC", "preschool_part_day", 30, 72, 10, 20, [{ upTo: 10, staff: 1 }, { upTo: 20, staff: 2 }], BC_SOURCE),
    stepped("BC", "school_with_kindergarten", 60, 156, 12, 24, [{ upTo: 12, staff: 1 }, { upTo: 24, staff: 2 }], BC_SOURCE),
    stepped("BC", "school_grade_2_up", 72, 156, 15, 30, [{ upTo: 15, staff: 1 }, { upTo: 30, staff: 2 }], BC_SOURCE),
    row("BC", "family_with_infant", 0, 48, 7, 7, BC_SOURCE),
    row("BC", "family_no_infant", 12, 144, 7, 7, BC_SOURCE),
  ],
  SK: [
    row("SK", "infant", 1, 18, 3, 6, SK_SOURCE),
    row("SK", "toddler", 18, 30, 5, 10, SK_SOURCE),
    row("SK", "preschool", 30, 84, 10, 20, SK_SOURCE),
    row("SK", "school", 72, 156, 15, 30, SK_SOURCE),
  ],
  MB: [
    row("MB", "mixed_infant", 3, 24, 4, 8, MB_SOURCE),
    row("MB", "mixed_preschool", 24, 72, 8, 16, MB_SOURCE),
    row("MB", "mixed_school", 72, 144, 15, 30, MB_SOURCE),
    row("MB", "separate_under_1", 3, 12, 3, 6, MB_SOURCE),
    row("MB", "separate_1_to_2", 12, 24, 4, 8, MB_SOURCE),
    row("MB", "separate_2_to_3", 24, 36, 6, 12, MB_SOURCE),
    row("MB", "separate_3_to_4", 36, 48, 8, 16, MB_SOURCE),
    row("MB", "separate_4_to_5", 48, 60, 9, 18, MB_SOURCE),
    row("MB", "separate_5_to_6", 60, 72, 10, 20, MB_SOURCE),
    row("MB", "separate_school", 72, 144, 15, 30, MB_SOURCE),
    row("MB", "nursery_infant", 3, 24, 4, 8, MB_SOURCE),
    row("MB", "nursery_preschool", 24, 72, 10, 20, MB_SOURCE),
  ],
  NB: [
    row("NB", "infant", 0, 24, 3, 9, NB_SOURCE),
    row("NB", "age_2", 24, 36, 5, 10, NB_SOURCE),
    row("NB", "age_3", 36, 48, 8, 16, NB_SOURCE),
    row("NB", "age_4_preschool", 48, 72, 10, 20, NB_SOURCE),
    row("NB", "school", 60, 156, 15, 30, NB_SOURCE),
  ],
  NS: [
    row("NS", "infant", 0, 18, 4, 10, NS_SOURCE),
    row("NS", "toddler", 18, 36, 6, 18, NS_SOURCE),
    row("NS", "preschool", 36, 72, 8, 24, NS_SOURCE),
    row("NS", "school", 60, 156, 15, 30, NS_SOURCE),
    row("NS", "family_any", 0, 156, 7, 7, NS_SOURCE),
  ],
  PE: [
    openGroup("PE", "under_22_months", 0, 22, 3, PE_SOURCE),
    openGroup("PE", "22_months_to_3", 22, 36, 5, PE_SOURCE),
    openGroup("PE", "over_3_to_school", 36, 72, 10, PE_SOURCE),
    openGroup("PE", "school", 60, 156, 15, PE_SOURCE),
  ],
  YT: [
    row("YT", "infant", 0, 18, 4, 8, YT_SOURCE),
    row("YT", "under_3_no_infant", 18, 36, 6, 12, YT_SOURCE),
    row("YT", "preschool", 36, 72, 8, 16, YT_SOURCE),
    row("YT", "school", 60, 156, 12, 24, YT_SOURCE),
  ],
};

const PLACEHOLDER: Record<string, RatioBand[]> = {
  QC: [band("QC", "infant", 5, 10), band("QC", "toddler", 8, 16), band("QC", "preschool", 10, 20), band("QC", "school", 20, 30)],
  NL: [band("NL", "infant", 3, 6), band("NL", "toddler", 5, 10), band("NL", "preschool", 8, 16), band("NL", "school", 15, 30)],
  NT: [band("NT", "infant", 3, 6), band("NT", "toddler", 4, 8), band("NT", "preschool", 8, 16), band("NT", "school", 10, 20)],
  NU: [band("NU", "infant", 3, 6), band("NU", "toddler", 5, 10), band("NU", "preschool", 8, 16), band("NU", "school", 12, 24)],
};

function row(
  province: string,
  ageKey: string,
  minMonths: number,
  maxMonths: number,
  childrenPerBlock: number,
  maxGroup: number,
  source: string,
): RatioBand {
  return {
    province,
    ageKey,
    minMonths,
    maxMonths,
    staffPerBlock: 1,
    childrenPerBlock,
    maxGroup,
    verified: true,
    source,
  };
}

function stepped(
  province: string,
  ageKey: string,
  minMonths: number,
  maxMonths: number,
  childrenPerBlock: number,
  maxGroup: number,
  steps: readonly RatioStep[],
  source: string,
): RatioBand {
  return { ...row(province, ageKey, minMonths, maxMonths, childrenPerBlock, maxGroup, source), steps };
}

function openGroup(province: string, ageKey: string, minMonths: number, maxMonths: number, childrenPerBlock: number, source: string): RatioBand {
  return row(province, ageKey, minMonths, maxMonths, childrenPerBlock, 0, source);
}

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
  if (CITED[code]?.length) return CITED[code];
  return PLACEHOLDER[code] ?? [];
}

export function ratioMode(env: EnvMap): PackMode {
  return modeFor(RATIO_FLAG, env);
}

export function staffNeeded(children: number, rule: Pick<RatioBand, "staffPerBlock" | "childrenPerBlock" | "steps">): number {
  const n = Math.max(0, Math.floor(children));
  if (n === 0) return 0;
  const steps = rule.steps;
  if (steps && steps.length) {
    const step = steps.find((item) => n <= item.upTo);
    return (step ?? steps[steps.length - 1]).staff;
  }
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
  const overGroup = rule.maxGroup > 0 && kids > rule.maxGroup;
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
