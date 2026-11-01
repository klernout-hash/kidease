/**
 * Parent fee caps. Amounts are daily cents.
 * A verified row cites a public page. A placeholder must not be treated as law.
 * British Columbia has no single ceiling in this table.
 */

import type { EnvMap } from "../flags.ts";
import { modeFor, type PackMode } from "./mode.ts";

export const FEE_FLAG = "FEATURE_FEE_CAPS";
export const FEE_LIVE_FLAG = "FEATURE_FEE_CAPS_LIVE";

export type FeeCap = {
  province: string;
  ageKey: string;
  maxDailyCents: number | null;
  noCeiling: boolean;
  verified: boolean;
  source: string;
};

const MB =
  "Manitoba maximum daily fees, effective December 8, 2024. Infant and preschool, 4 to 10 hours: $10. https://www.manitoba.ca/education/childcare/families/pubs/maxdailyfee.pdf";

const ON =
  "Ontario CWELCC full-day base fee cap of $22 for infant, toddler, and preschool, including mandatory fees, for programs in CWELCC. Region of Peel 2026 CWELCC guideline citing O. Reg. 488/24 and O. Reg. 137/15. https://peelregion.ca/sites/default/files/2026-01/2026-LHCC-CWELCC-Guideline.pdf";

const BC =
  "British Columbia fee reductions do not set one ceiling for every centre. Out-of-pocket fees are not reduced below $200 a month for full-time care. https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/child-care-fee-reduction-initiative-provider-opt-in-status/information-for-families";

export const FEE_CAPS: readonly FeeCap[] = [
  { province: "MB", ageKey: "infant", maxDailyCents: 1000, noCeiling: false, verified: true, source: MB },
  { province: "MB", ageKey: "preschool", maxDailyCents: 1000, noCeiling: false, verified: true, source: MB },
  { province: "MB", ageKey: "school", maxDailyCents: 1000, noCeiling: false, verified: true, source: `${MB} School-age, three periods: $10.` },
  { province: "ON", ageKey: "infant", maxDailyCents: 2200, noCeiling: false, verified: true, source: ON },
  { province: "ON", ageKey: "toddler", maxDailyCents: 2200, noCeiling: false, verified: true, source: ON },
  { province: "ON", ageKey: "preschool", maxDailyCents: 2200, noCeiling: false, verified: true, source: ON },
  { province: "BC", ageKey: "infant", maxDailyCents: null, noCeiling: true, verified: true, source: BC },
  { province: "BC", ageKey: "toddler", maxDailyCents: null, noCeiling: true, verified: true, source: BC },
  { province: "BC", ageKey: "preschool", maxDailyCents: null, noCeiling: true, verified: true, source: BC },
  { province: "BC", ageKey: "school", maxDailyCents: null, noCeiling: true, verified: true, source: BC },
  placeholder("AB", "infant", 1500, "PLACEHOLDER. A 2026 research summary reports a $15 parent fee in Alberta cities. Confirm on alberta.ca before enforcement."),
  placeholder("NL", "preschool", 1000, "PLACEHOLDER. A 2026 research summary groups Newfoundland and Labrador with $10-a-day fees. Confirm the official schedule."),
  placeholder("PE", "preschool", 1000, "PLACEHOLDER. A 2026 research summary groups Prince Edward Island with $10-a-day fees. Confirm the official schedule."),
  placeholder("SK", "preschool", 1000, "PLACEHOLDER. A 2026 research summary groups Saskatchewan with $10-a-day fees. Confirm the official schedule."),
  placeholder("NU", "preschool", 1000, "PLACEHOLDER. A 2026 research summary groups Nunavut with $10-a-day fees. Confirm the official schedule."),
  placeholder("QC", "preschool", 965, "PLACEHOLDER. A 2026 research summary reports Quebec's reduced contribution at $9.65 a day. Confirm on quebec.ca."),
];

function placeholder(province: string, ageKey: string, cents: number, source: string): FeeCap {
  return { province, ageKey, maxDailyCents: cents, noCeiling: false, verified: false, source };
}

export function feeMode(env: EnvMap): PackMode {
  return modeFor(FEE_FLAG, env);
}

export function feeCapFor(province: string, ageKey: string): FeeCap | null {
  const code = province.trim().toUpperCase();
  return FEE_CAPS.find((row) => row.province === code && row.ageKey === ageKey) ?? null;
}

export type FeeDecision = {
  status: "ok" | "warn" | "unknown" | "no_cap" | "off";
  capCents: number | null;
  verified: boolean;
  delivery: "skip" | "log" | "show";
};

/**
 * Off: no warning.
 * Practice: log the warning, do not block publish or the invoice.
 * Live: show the warning. Publishing is still allowed after the warning is shown.
 */
export function feeDecision(input: {
  mode: PackMode;
  province: string;
  ageKey: string;
  dailyCents: number;
}): FeeDecision {
  if (input.mode === "off") {
    return { status: "off", capCents: null, verified: false, delivery: "skip" };
  }
  const cap = feeCapFor(input.province, input.ageKey);
  if (!cap) return { status: "unknown", capCents: null, verified: false, delivery: "skip" };
  if (cap.noCeiling || cap.maxDailyCents == null) {
    return { status: "no_cap", capCents: null, verified: cap.verified, delivery: "skip" };
  }
  if (!cap.verified) {
    return { status: "unknown", capCents: cap.maxDailyCents, verified: false, delivery: "skip" };
  }
  if (input.dailyCents > cap.maxDailyCents) {
    return {
      status: "warn",
      capCents: cap.maxDailyCents,
      verified: true,
      delivery: input.mode === "dry_run" ? "log" : "show",
    };
  }
  return { status: "ok", capCents: cap.maxDailyCents, verified: true, delivery: "skip" };
}

/** Monthly dollars are not converted into a fake daily fee. Ask for the day count. */
export function monthlyNeedsDays(monthlyCents: number): boolean {
  return monthlyCents > 0;
}

export function feeCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour les garderies",
      why: "Voyez si un tarif quotidien dépasse le plafond publié de votre province.",
      next: "Vérifier les tarifs",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint. Les tarifs ne sont pas bloqués.",
      practice: "Mode pratique : l’avertissement est écrit. La publication n’est pas bloquée.",
      empty: "Aucun plafond vérifié pour cette province.",
      govWhat: "KidEase pour votre province",
      govWhy: "Voyez les centres au-dessus du plafond. Aucun nom d’enfant.",
    };
  }
  return {
    what: "KidEase for daycares",
    why: "See if a daily fee is above your province's published cap.",
    next: "Check fees",
    help: "Help",
    home: "Home",
    off: "This tool is off. Fees are not blocked.",
    practice: "Practice mode: the warning is written down. Publishing is not blocked.",
    empty: "No verified cap for this province.",
    govWhat: "KidEase for your province",
    govWhy: "See centres above the cap. No child names.",
  };
}
