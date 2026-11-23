/**
 * What the centre pays on top of wages.
 *
 * CPP, CPP2, QPP, EI (1.4 times), and QPIP come from the engine per pay.
 * Payroll health taxes are yearly and depend on the centre's total payroll,
 * so the per-pay share here is an estimate the owner can check.
 * WCB (or CNESST in Quebec) is a rate each centre gets from its board. The
 * owner types it in. KidEase never guesses it.
 */

import type { Province } from "./tables.ts";

export const EMPLOYER_AS_OF = "2026-11-22";

export type HealthTaxRule = {
  code: "on_eht" | "bc_eht" | "mb_hel" | "nl_hapset" | "qc_hsf";
  nameEn: string;
  nameFr: string;
  source: string;
  asOf: string;
  verified: true;
};

export const HEALTH_TAX_RULES: Partial<Record<Province, HealthTaxRule>> = {
  ON: {
    code: "on_eht",
    nameEn: "Ontario Employer Health Tax (EHT)",
    nameFr: "Impôt-santé des employeurs de l'Ontario (ISE)",
    source: "https://www.ontario.ca/document/employer-health-tax-eht",
    asOf: EMPLOYER_AS_OF,
    verified: true,
  },
  BC: {
    code: "bc_eht",
    nameEn: "BC Employer Health Tax",
    nameFr: "Impôt-santé des employeurs de la C.-B.",
    source: "https://www2.gov.bc.ca/gov/content/taxes/employer-health-tax/employer-health-tax-overview",
    asOf: EMPLOYER_AS_OF,
    verified: true,
  },
  MB: {
    code: "mb_hel",
    nameEn: "Manitoba Health and Post Secondary Education Tax Levy",
    nameFr: "Impôt pour la santé et l'enseignement postsecondaire du Manitoba",
    source: "https://www.gov.mb.ca/finance/taxation/taxes/payroll.html",
    asOf: EMPLOYER_AS_OF,
    verified: true,
  },
  NL: {
    code: "nl_hapset",
    nameEn: "Newfoundland and Labrador Health and Post-Secondary Education Tax (HAPSET)",
    nameFr: "Impôt sur la santé et l'enseignement postsecondaire de T.-N.-L. (HAPSET)",
    source: "https://www.gov.nl.ca/fin/tax-programs-incentives/business/education/",
    asOf: EMPLOYER_AS_OF,
    verified: true,
  },
  QC: {
    code: "qc_hsf",
    nameEn: "Quebec Health Services Fund (HSF)",
    nameFr: "Fonds des services de santé (FSS)",
    source: "https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/employers-principal-changes-for-2026/",
    asOf: EMPLOYER_AS_OF,
    verified: true,
  },
};

const ON_EHT_BANDS: readonly { upTo: number; rate: number }[] = [
  { upTo: 200_000, rate: 0.0098 },
  { upTo: 230_000, rate: 0.01101 },
  { upTo: 260_000, rate: 0.01223 },
  { upTo: 290_000, rate: 0.01344 },
  { upTo: 320_000, rate: 0.01465 },
  { upTo: 350_000, rate: 0.01586 },
  { upTo: 380_000, rate: 0.01708 },
  { upTo: 400_000, rate: 0.01829 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.0195 },
];

/**
 * Yearly payroll health tax in cents for a yearly payroll in cents.
 * `exemptionEligible`: Ontario's $1M exemption needs payroll under $5M (or a charity).
 * `associatedShare`: when centres are associated, the exemption is shared. Default 1 (all of it).
 */
export function yearlyHealthTaxCents(input: {
  province: Province;
  payrollCents: number;
  exemptionEligible?: boolean;
  quebecSector?: "other" | "primary_manufacturing";
}): { cents: number; rateNote: string; rule: HealthTaxRule | null } {
  const rule = HEALTH_TAX_RULES[input.province] ?? null;
  const payroll = Math.max(0, input.payrollCents) / 100;
  if (!rule) return { cents: 0, rateNote: "No payroll health tax for this province.", rule: null };
  switch (rule.code) {
    case "on_eht": {
      const band = ON_EHT_BANDS.find((row) => payroll <= row.upTo) ?? ON_EHT_BANDS[ON_EHT_BANDS.length - 1];
      const eligible = input.exemptionEligible !== false && payroll < 5_000_000;
      const taxable = Math.max(0, payroll - (eligible ? 1_000_000 : 0));
      return { cents: Math.round(taxable * band.rate * 100), rateNote: `${(band.rate * 100).toFixed(3)}% of payroll above the exemption.`, rule };
    }
    case "bc_eht": {
      if (payroll <= 1_000_000) return { cents: 0, rateNote: "Payroll of $1,000,000 or less pays none.", rule };
      if (payroll <= 1_500_000) return { cents: Math.round((payroll - 1_000_000) * 0.0585 * 100), rateNote: "5.85% on payroll above $1,000,000.", rule };
      return { cents: Math.round(payroll * 0.0195 * 100), rateNote: "1.95% on all payroll.", rule };
    }
    case "mb_hel": {
      if (payroll <= 2_500_000) return { cents: 0, rateNote: "Payroll of $2.5 million or less pays none.", rule };
      if (payroll <= 5_000_000) return { cents: Math.round((payroll - 2_500_000) * 0.043 * 100), rateNote: "4.3% on payroll above $2.5 million.", rule };
      return { cents: Math.round(payroll * 0.0215 * 100), rateNote: "2.15% on all payroll.", rule };
    }
    case "nl_hapset": {
      return {
        cents: Math.round(Math.max(0, payroll - 2_000_000) * 0.02 * 100),
        rateNote: "2% on payroll above $2 million.",
        rule,
      };
    }
    case "qc_hsf": {
      const primary = input.quebecSector === "primary_manufacturing";
      let rate: number;
      if (payroll <= 1_000_000) rate = primary ? 0.0125 : 0.0165;
      else if (payroll < 7_800_000) rate = (primary ? 0.8074 + 0.4426 * (payroll / 1_000_000) : 1.2662 + 0.3838 * (payroll / 1_000_000)) / 100;
      else rate = 0.0426;
      return { cents: Math.round(payroll * rate * 100), rateNote: `${(rate * 100).toFixed(4)}% of all payroll.`, rule };
    }
    default:
      return { cents: 0, rateNote: "", rule };
  }
}

/** Quebec labour standards (CNT): 0.06% of each person's pay, up to $103,000 a year (2026). */
export const QC_CNT_2026 = {
  rate: 0.0006,
  maxRemuneration: 103_000,
  source: "https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/contribution-related-to-labour-standards/",
  asOf: EMPLOYER_AS_OF,
  verified: true,
} as const;

/** Quebec WSDRF: 1% of payroll, less training spending, when payroll is over $2 million. */
export const QC_WSDRF = {
  rate: 0.01,
  threshold: 2_000_000,
  source: "https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/contribution-to-the-workforce-skills-development-and-recognition-fund/",
  asOf: EMPLOYER_AS_OF,
  verified: true,
} as const;

export function cntCents(payCents: number, ytdPayCents: number): number {
  const cap = QC_CNT_2026.maxRemuneration * 100;
  const room = Math.max(0, cap - Math.max(0, ytdPayCents));
  return Math.round(Math.min(Math.max(0, payCents), room) * QC_CNT_2026.rate);
}

export type EmployerCostInput = {
  province: Province;
  /** Gross pay this period for this person. */
  grossCents: number;
  /** This person's year-to-date gross before this pay (Quebec CNT cap). */
  ytdGrossCents?: number;
  /** From the engine. */
  employerCppCents: number;
  employerCpp2Cents: number;
  employerEiCents: number;
  employerQpipCents: number;
  /** Owner-entered WCB or CNESST rate in basis points of insurable pay (e.g. 125 = $1.25 per $100). */
  wcbRateBps?: number | null;
  /** Centre's yearly payroll estimate, for the health tax share. */
  yearlyPayrollCents?: number | null;
  exemptionEligible?: boolean;
};

export type EmployerCostLine = { code: string; cents: number; estimate: boolean; source: string | null; asOf: string };

export function employerCosts(input: EmployerCostInput): { lines: EmployerCostLine[]; totalCents: number; notes: string[] } {
  const notes: string[] = [];
  const lines: EmployerCostLine[] = [
    { code: input.province === "QC" ? "employer_qpp" : "employer_cpp", cents: input.employerCppCents, estimate: false, source: null, asOf: EMPLOYER_AS_OF },
    { code: input.province === "QC" ? "employer_qpp2" : "employer_cpp2", cents: input.employerCpp2Cents, estimate: false, source: null, asOf: EMPLOYER_AS_OF },
    { code: "employer_ei", cents: input.employerEiCents, estimate: false, source: null, asOf: EMPLOYER_AS_OF },
  ];
  if (input.province === "QC") {
    lines.push({ code: "employer_qpip", cents: input.employerQpipCents, estimate: false, source: null, asOf: EMPLOYER_AS_OF });
    lines.push({ code: "qc_cnt", cents: cntCents(input.grossCents, input.ytdGrossCents ?? 0), estimate: false, source: QC_CNT_2026.source, asOf: EMPLOYER_AS_OF });
  }
  const yearly = input.yearlyPayrollCents ?? null;
  if (HEALTH_TAX_RULES[input.province]) {
    if (yearly != null && yearly > 0) {
      const tax = yearlyHealthTaxCents({ province: input.province, payrollCents: yearly, exemptionEligible: input.exemptionEligible });
      const share = Math.round((tax.cents * Math.max(0, input.grossCents)) / yearly);
      lines.push({ code: tax.rule?.code ?? "health_tax", cents: share, estimate: true, source: tax.rule?.source ?? null, asOf: EMPLOYER_AS_OF });
    } else {
      notes.push("Add your yearly payroll to see your share of the payroll health tax.");
    }
  }
  if (input.wcbRateBps != null && input.wcbRateBps > 0) {
    lines.push({
      code: input.province === "QC" ? "cnesst" : "wcb",
      cents: Math.round((Math.max(0, input.grossCents) * input.wcbRateBps) / 10_000),
      estimate: true,
      source: null,
      asOf: EMPLOYER_AS_OF,
    });
  } else {
    notes.push(input.province === "QC" ? "Add your CNESST rate to see it here." : "Add your WCB rate to see it here.");
  }
  return { lines, totalCents: lines.reduce((sum, line) => sum + line.cents, 0), notes };
}
