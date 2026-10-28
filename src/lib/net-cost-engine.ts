/**
 * Estimate of parent cost after published provincial programs, CCB, and T778.
 * The parent types the centre's posted monthly fee. This file never invents one.
 * Figures are estimates. Provinces change the rules. Confirm with the centre.
 */

export const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;
export type ProvinceCode = (typeof PROVINCES)[number];
export type CostAgeBand = "infant" | "toddler" | "preschool" | "school-age";

export const BILLING_DAYS_PER_MONTH = 21.75;
export const TEN_A_DAY_MONTHLY = 10 * BILLING_DAYS_PER_MONTH;
export const QC_REDUCED_DAILY = 9.65;
export const QC_REDUCED_MONTHLY = QC_REDUCED_DAILY * BILLING_DAYS_PER_MONTH;
export const AB_AFFORDABILITY_MONTHLY = 15 * BILLING_DAYS_PER_MONTH;

const TEN_A_DAY = new Set<ProvinceCode>(["SK", "MB", "NB", "NS", "PE", "NL", "YT", "NT", "NU", "BC"]);

export type NetCostInput = {
  province: string;
  householdIncome: number;
  ageBand: CostAgeBand;
  /** Centre's posted full-time monthly fee. Required. */
  grossMonthly: number;
  /** Centre participates in the provincial reduced-fee program. */
  participating?: boolean;
  /** Québec reduced-contribution space (CPE / subsidized). */
  qcSubsidized?: boolean;
};

export type NetCostResult = {
  province: ProvinceCode;
  grossMonthly: number;
  parentMonthly: number;
  parentDaily: number;
  parentAnnual: number;
  programEn: string;
  programFr: string;
  ccbMonthly: number;
  t778AnnualSavings: number;
  netMonthlyAfterT778: number;
  estimate: true;
};

export function isProvinceCode(value: string): value is ProvinceCode {
  return (PROVINCES as readonly string[]).includes(value.trim().toUpperCase());
}

function money(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function clampIncome(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 500_000);
}

/** Revenu Québec childcare credit band: 78% at low income, 26% at high income. */
export function qcTaxCreditRate(householdIncome: number): number {
  const income = clampIncome(householdIncome);
  const low = 25_000;
  const high = 165_000;
  if (income <= low) return 0.78;
  if (income >= high) return 0.26;
  const t = (income - low) / (high - low);
  return 0.78 - t * (0.78 - 0.26);
}

/** One child under 6. 2025-style curve, labeled an estimate by the caller. */
export function estimateCcbMonthly(householdIncome: number, ageBand: CostAgeBand): number {
  if (ageBand === "school-age") return 0;
  const income = clampIncome(householdIncome);
  const annualMax = 7997;
  const first = 37_487;
  const second = 81_222;
  let annual = annualMax;
  if (income > second) annual -= (income - first) * 0.07 + (income - second) * 0.032;
  else if (income > first) annual -= (income - first) * 0.07;
  return money(Math.max(0, annual) / 12);
}

export function t778Cap(ageBand: CostAgeBand): number {
  return ageBand === "school-age" ? 5000 : 8000;
}

export function estimateMarginalRate(householdIncome: number): number {
  const income = clampIncome(householdIncome);
  if (income < 55_000) return 0.2;
  if (income < 100_000) return 0.3;
  if (income < 150_000) return 0.38;
  return 0.45;
}

export function estimateT778Savings(parentAnnual: number, householdIncome: number, ageBand: CostAgeBand): number {
  const eligible = Math.min(Math.max(0, parentAnnual), t778Cap(ageBand));
  return money(eligible * estimateMarginalRate(householdIncome));
}

function abIncomeSubsidy(parentMonthly: number, income: number): number {
  if (income >= 180_000) return 0;
  const help = 1 - income / 180_000;
  return parentMonthly * 0.5 * help;
}

function onMunicipalShare(income: number): number {
  if (income >= 120_000) return 0;
  if (income <= 40_000) return 0.35;
  return 0.35 * (1 - (income - 40_000) / 80_000);
}

export function estimateNetCost(input: NetCostInput): NetCostResult {
  const code = input.province.trim().toUpperCase();
  const province: ProvinceCode = isProvinceCode(code) ? code : "ON";
  const gross = money(input.grossMonthly);
  const income = clampIncome(input.householdIncome);
  const participating = input.participating !== false;
  const school = input.ageBand === "school-age";
  let parent = gross;
  let programEn = "Posted fee. No provincial reduction applied.";
  let programFr = "Tarif affiché. Aucune réduction provinciale appliquée.";

  if (province === "QC") {
    if (input.qcSubsidized && !school) {
      parent = Math.min(gross, QC_REDUCED_MONTHLY);
      programEn = "Québec reduced contribution, about $9.65 a day.";
      programFr = "Contribution réduite du Québec, environ 9,65 $ par jour.";
    } else {
      const rate = qcTaxCreditRate(income);
      parent = gross * (1 - rate);
      const pct = Math.round(rate * 100);
      programEn = `Québec refundable tax credit estimate, about ${pct}%.`;
      programFr = `Estimation du crédit d'impôt remboursable du Québec, environ ${pct} %.`;
    }
  } else if (province === "AB" && participating && !school) {
    parent = Math.min(gross, AB_AFFORDABILITY_MONTHLY);
    parent = Math.max(0, parent - abIncomeSubsidy(parent, income));
    programEn = "Alberta affordability grant, plus an income subsidy estimate up to $180,000.";
    programFr = "Subvention d'abordabilité de l'Alberta, plus une estimation de subvention selon le revenu jusqu'à 180 000 $.";
  } else if (province === "ON" && participating) {
    parent = gross * (1 - 0.5275);
    if (!school) parent = Math.min(parent, TEN_A_DAY_MONTHLY);
    parent = Math.max(0, parent * (1 - onMunicipalShare(income)));
    programEn = "Ontario CWELCC 52.75% reduction, $10-a-day target, plus a municipal subsidy estimate.";
    programFr = "Réduction de 52,75 % de l'AGJE en Ontario, cible de 10 $ par jour, plus une estimation de subvention municipale.";
  } else if (TEN_A_DAY.has(province) && participating && !school) {
    parent = Math.min(gross, TEN_A_DAY_MONTHLY);
    programEn =
      province === "BC"
        ? "British Columbia CCFRI $10-a-day estimate at a participating centre."
        : "$10-a-day estimate at a participating centre.";
    programFr =
      province === "BC"
        ? "Estimation à 10 $ par jour (CCFRI) dans un centre participant en Colombie-Britannique."
        : "Estimation à 10 $ par jour dans un centre participant.";
  }

  if (province === "BC" && participating && !school) {
    const accb = income >= 111_000 ? 0 : income <= 45_000 ? parent * 0.4 : parent * 0.4 * (1 - (income - 45_000) / 66_000);
    parent = Math.max(0, parent - accb);
    programEn = "British Columbia CCFRI plus an Affordable Child Care Benefit estimate.";
    programFr = "CCFRI de la Colombie-Britannique plus une estimation de l'Allocation pour la garde d'enfants abordable.";
  }

  parent = money(Math.min(gross, Math.max(0, parent)));
  const parentAnnual = money(parent * 12);
  const t778 = estimateT778Savings(parentAnnual, income, input.ageBand);
  const ccb = estimateCcbMonthly(income, input.ageBand);
  return {
    province,
    grossMonthly: gross,
    parentMonthly: parent,
    parentDaily: money(parent / BILLING_DAYS_PER_MONTH),
    parentAnnual,
    programEn,
    programFr,
    ccbMonthly: ccb,
    t778AnnualSavings: t778,
    netMonthlyAfterT778: money(Math.max(0, parent - t778 / 12)),
    estimate: true,
  };
}
