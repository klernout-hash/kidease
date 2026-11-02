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
  /**
   * False when the cited amount applies only to funded, designated, or subsidized
   * programs. The desk does not warn every centre in that case.
   */
  provinceWide: boolean;
  source: string;
};

const MB =
  "Manitoba maximum daily fees, effective December 8, 2024. Infant and preschool, 4 to 10 hours: $10. https://www.manitoba.ca/education/childcare/families/pubs/maxdailyfee.pdf";

const ON =
  "Ontario CWELCC full-day base fee cap of $22 for infant, toddler, and preschool, including mandatory fees, for programs in CWELCC. Region of Peel 2026 CWELCC guideline citing O. Reg. 488/24 and O. Reg. 137/15. https://peelregion.ca/sites/default/files/2026-01/2026-LHCC-CWELCC-Guideline.pdf";

const BC =
  "British Columbia fee reductions do not set one ceiling for every centre. Out-of-pocket fees are not reduced below $200 a month for full-time care. https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/child-care-fee-reduction-initiative-provider-opt-in-status/information-for-families";

const AB =
  "Alberta flat parent fee for a licensed daycare or family day home that receives affordability funding, kindergarten age or younger, registered for 100 or more hours a month: $326.25 a month. The province also describes this as a flat $15 a day as of 1 April 2025. Part-time (50 to 99 hours) is $230 a month. Not every program is funded, and optional services can be extra. Read 1 November 2026. https://www.alberta.ca/childcare-fees";

const SK =
  "The Child Care Regulations, 2015, C-7.31 Reg 1, s. 18(5): for an eligible child, $217.50 a month for full-time care (10 or more days) or $10 a day up to $90 a month for daily care (9 days or fewer). Eligible child is under 6, with the kindergarten extension in the definition. Read 1 November 2026. https://publications.saskatchewan.ca/api/v1/products/73483/formats/82271/download";

const QC =
  "Quebec reduced contribution for a subsidized child care service in 2026: $9.65 a day, indexed each 1 January. This is not the fee at an unsubsidized garderie. Read 1 November 2026. https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/tarifs";

const NB =
  "New Brunswick Parent Fee Grid for a designated facility, one provincial rate from 1 May 2026. Full day: infant (0–24 months) $19, preschool (2–5 years, not in school) $16. Part day: infant $12, preschool $7. Not every licence is designated. Read 1 November 2026. https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families.html";

const PE =
  "Prince Edward Island: $10 a day at Early Years Centres and licensed family home centres for children from birth to school entry, from 1 January 2024. This is not a cap on every licence. Read 1 November 2026. https://www.princeedwardisland.ca/en/news/10-a-day-child-care-starting-january-1";

export const FEE_CAPS: readonly FeeCap[] = [
  { province: "MB", ageKey: "infant", maxDailyCents: 1000, noCeiling: false, verified: true, provinceWide: true, source: MB },
  { province: "MB", ageKey: "preschool", maxDailyCents: 1000, noCeiling: false, verified: true, provinceWide: true, source: MB },
  { province: "MB", ageKey: "toddler", maxDailyCents: 1000, noCeiling: false, verified: true, provinceWide: true, source: `${MB} Toddler care uses the preschool maximum of $10 for 4 to 10 hours.` },
  { province: "MB", ageKey: "school", maxDailyCents: 1000, noCeiling: false, verified: true, provinceWide: true, source: `${MB} School-age, three periods: $10.` },
  { province: "ON", ageKey: "infant", maxDailyCents: 2200, noCeiling: false, verified: true, provinceWide: true, source: ON },
  { province: "ON", ageKey: "toddler", maxDailyCents: 2200, noCeiling: false, verified: true, provinceWide: true, source: ON },
  { province: "ON", ageKey: "preschool", maxDailyCents: 2200, noCeiling: false, verified: true, provinceWide: true, source: ON },
  { province: "BC", ageKey: "infant", maxDailyCents: null, noCeiling: true, verified: true, provinceWide: true, source: BC },
  { province: "BC", ageKey: "toddler", maxDailyCents: null, noCeiling: true, verified: true, provinceWide: true, source: BC },
  { province: "BC", ageKey: "preschool", maxDailyCents: null, noCeiling: true, verified: true, provinceWide: true, source: BC },
  { province: "BC", ageKey: "school", maxDailyCents: null, noCeiling: true, verified: true, provinceWide: true, source: BC },
  scoped("AB", "infant", 1500, AB),
  scoped("AB", "preschool", 1500, AB),
  scoped("SK", "infant", 1000, SK),
  scoped("SK", "toddler", 1000, SK),
  scoped("SK", "preschool", 1000, SK),
  scoped("QC", "preschool", 965, QC),
  scoped("NB", "infant", 1900, NB),
  scoped("NB", "preschool", 1600, NB),
  scoped("PE", "preschool", 1000, PE),
  placeholder("NL", "preschool", 1000, "PLACEHOLDER. The Newfoundland and Labrador fee schedule was not opened on 1 November 2026."),
  placeholder("NU", "preschool", 1000, "PLACEHOLDER. The Nunavut fee schedule was not opened on 1 November 2026."),
  placeholder("NS", "preschool", 0, "PLACEHOLDER. Nova Scotia's parent-fee page was not opened on 1 November 2026. No daily cap is stored."),
  placeholder("NT", "preschool", 0, "PLACEHOLDER. A single daily cap was not opened on 1 November 2026. Northwest Territories describes an average, not one ceiling."),
  placeholder("YT", "preschool", 0, "PLACEHOLDER. A single daily cap was not opened on 1 November 2026. Yukon describes an average, not one ceiling."),
];

function scoped(province: string, ageKey: string, cents: number, source: string): FeeCap {
  return { province, ageKey, maxDailyCents: cents, noCeiling: false, verified: true, provinceWide: false, source };
}

function placeholder(province: string, ageKey: string, cents: number, source: string): FeeCap {
  return { province, ageKey, maxDailyCents: cents > 0 ? cents : null, noCeiling: false, verified: false, provinceWide: false, source };
}

export function feeMode(env: EnvMap): PackMode {
  return modeFor(FEE_FLAG, env);
}

export function feeCapFor(province: string, ageKey: string): FeeCap | null {
  const code = province.trim().toUpperCase();
  return FEE_CAPS.find((row) => row.province === code && row.ageKey === ageKey) ?? null;
}

/** A province-wide verified daily cap, such as Manitoba's $10. */
export function publishedCapsFor(province: string): FeeCap[] {
  const code = province.trim().toUpperCase();
  return FEE_CAPS.filter(
    (row) => row.province === code && row.verified && row.provinceWide && !row.noCeiling && row.maxDailyCents != null,
  );
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
  if (!cap.verified || !cap.provinceWide) {
    return { status: "unknown", capCents: cap.maxDailyCents, verified: cap.verified, delivery: "skip" };
  }
  if (cap.noCeiling || cap.maxDailyCents == null) {
    return { status: "no_cap", capCents: null, verified: cap.verified, delivery: "skip" };
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
      clear: "Aucun centre n’est au-dessus du plafond publié.",
      capLine: "Plafond publié",
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
    clear: "No centre is above the published cap.",
    capLine: "Published cap",
    govWhat: "KidEase for your province",
    govWhy: "See centres above the cap. No child names.",
  };
}
