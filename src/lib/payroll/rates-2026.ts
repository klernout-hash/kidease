/**
 * 2026 payroll rates used only as an estimate.
 * Each figure is cited. Anything not checked against an official page is
 * `verified: false` and is not turned into a dollar amount.
 *
 * As-of: 22 November 2026.
 * The pay screen always says the payroll partner does the final calculation.
 */

export const RATE_AS_OF = "2026-11-22";

export const CPP_2026 = {
  year: 2026,
  ympeCents: 7_460_000,
  yampeCents: 8_500_000,
  basicExemptionCents: 350_000,
  employeeRate: 0.0595,
  baseRate: 0.0495,
  firstAdditionalRate: 0.01,
  secondRate: 0.04,
  maxEmployeeCents: 423_045,
  maxBaseCents: 351_945,
  maxFirstAdditionalCents: 71_100,
  maxSecondCents: 41_600,
  verified: true,
  asOf: RATE_AS_OF,
  source:
    "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
  source2:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032oc-jan/t4032oc-january-general-information.html",
} as const;

export const QPP_2026 = {
  year: 2026,
  ympeCents: 7_460_000,
  yampeCents: 8_500_000,
  basicExemptionCents: 350_000,
  employeeRate: 0.063,
  baseRate: 0.053,
  firstAdditionalRate: 0.01,
  secondRate: 0.04,
  maxEmployeeCents: 447_930,
  maxBaseCents: 376_830,
  maxSecondCents: 41_600,
  verified: true,
  asOf: RATE_AS_OF,
  source:
    "https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/qpp-contributions/maximum-pensionable-earnings-and-contribution-rate/",
} as const;

export const EI_2026 = {
  year: 2026,
  maxInsurableCents: 6_890_000,
  employeeRate: 0.0163,
  employerRate: 0.02282,
  maxEmployeeCents: 112_307,
  maxEmployerCents: 157_230,
  quebecEmployeeRate: 0.013,
  quebecEmployerRate: 0.0182,
  quebecMaxEmployeeCents: 89_570,
  quebecMaxEmployerCents: 125_398,
  verified: true,
  asOf: RATE_AS_OF,
  source:
    "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html",
} as const;

export const QPIP_2026 = {
  year: 2026,
  maxInsurableCents: 10_300_000,
  employeeRate: 0.0043,
  employerRate: 0.00602,
  maxEmployeeCents: 44_290,
  maxEmployerCents: 62_006,
  /** CRA T4032-QC prints these figures and says to confirm them with Revenu Québec. */
  verified: true,
  confirmWith: "Revenu Québec",
  asOf: RATE_AS_OF,
  source:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032qc-jan/t4032qc-january-general-information.html",
} as const;

export type TaxBracket = { upTo: number; rate: number; k: number };

/** Chart 1, T4032 January 2026. Lowest rate 14% for 2026. */
export const FEDERAL_BRACKETS_2026: readonly TaxBracket[] = [
  { upTo: 58_523, rate: 0.14, k: 0 },
  { upTo: 117_045, rate: 0.205, k: 3_804 },
  { upTo: 181_440, rate: 0.26, k: 10_241 },
  { upTo: 258_482, rate: 0.29, k: 15_685 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.33, k: 26_024 },
];

export const FEDERAL_TAX_2026 = {
  lowestRate: 0.14,
  maxBasicPersonal: 16_452,
  minBasicPersonal: 14_829,
  canadaEmploymentAmount: 1_501,
  quebecAbatement: 0.165,
  verified: true,
  asOf: RATE_AS_OF,
  note: "High-income basic personal amount phase-out is not applied. The centre enters the TD1 claim amount. The default is the published maximum.",
  source:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html",
} as const;

/** Provincial brackets from the CRA 2026 income-thresholds page. Personal amounts are verified only where noted. */
export const PROVINCIAL_BRACKETS_2026: Record<string, readonly TaxBracket[]> = {
  AB: [
    { upTo: 61_200, rate: 0.08, k: 0 },
    { upTo: 154_259, rate: 0.1, k: 1_224 },
    { upTo: 185_111, rate: 0.12, k: 4_309 },
    { upTo: 246_813, rate: 0.13, k: 6_160 },
    { upTo: 370_220, rate: 0.14, k: 8_628 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.15, k: 12_331 },
  ],
  BC: [
    { upTo: 50_363, rate: 0.0506, k: 0 },
    { upTo: 100_728, rate: 0.077, k: 1_330 },
    { upTo: 115_648, rate: 0.105, k: 4_150 },
    { upTo: 140_430, rate: 0.1229, k: 6_220 },
    { upTo: 190_405, rate: 0.147, k: 9_604 },
    { upTo: 265_545, rate: 0.168, k: 13_603 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.205, k: 23_428 },
  ],
  MB: [
    { upTo: 47_000, rate: 0.108, k: 0 },
    { upTo: 100_000, rate: 0.1275, k: 917 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.174, k: 5_567 },
  ],
  NB: [
    { upTo: 52_333, rate: 0.094, k: 0 },
    { upTo: 104_666, rate: 0.14, k: 2_407 },
    { upTo: 193_861, rate: 0.16, k: 4_501 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.195, k: 11_286 },
  ],
  NL: [
    { upTo: 44_678, rate: 0.087, k: 0 },
    { upTo: 89_354, rate: 0.145, k: 2_591 },
    { upTo: 159_528, rate: 0.158, k: 3_753 },
    { upTo: 223_340, rate: 0.178, k: 6_943 },
    { upTo: 285_319, rate: 0.198, k: 11_410 },
    { upTo: 570_638, rate: 0.208, k: 14_263 },
    { upTo: 1_141_275, rate: 0.213, k: 17_117 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.218, k: 22_823 },
  ],
  NS: [
    { upTo: 30_995, rate: 0.0879, k: 0 },
    { upTo: 61_991, rate: 0.1495, k: 1_909 },
    { upTo: 97_417, rate: 0.1667, k: 2_976 },
    { upTo: 157_124, rate: 0.175, k: 3_784 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.21, k: 9_283 },
  ],
  NT: [
    { upTo: 53_003, rate: 0.059, k: 0 },
    { upTo: 106_009, rate: 0.086, k: 1_431 },
    { upTo: 172_346, rate: 0.122, k: 5_247 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.1405, k: 8_436 },
  ],
  NU: [
    { upTo: 55_801, rate: 0.04, k: 0 },
    { upTo: 111_602, rate: 0.07, k: 1_674 },
    { upTo: 181_439, rate: 0.09, k: 3_906 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.115, k: 8_442 },
  ],
  ON: [
    { upTo: 53_891, rate: 0.0505, k: 0 },
    { upTo: 107_785, rate: 0.0915, k: 2_210 },
    { upTo: 150_000, rate: 0.1116, k: 4_376 },
    { upTo: 220_000, rate: 0.1216, k: 5_876 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.1316, k: 8_076 },
  ],
  PE: [
    { upTo: 33_928, rate: 0.095, k: 0 },
    { upTo: 65_820, rate: 0.1347, k: 1_347 },
    { upTo: 106_890, rate: 0.166, k: 3_407 },
    { upTo: 142_250, rate: 0.1762, k: 4_497 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.19, k: 6_460 },
  ],
  SK: [
    { upTo: 54_532, rate: 0.105, k: 0 },
    { upTo: 155_805, rate: 0.125, k: 1_091 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.145, k: 4_207 },
  ],
  YT: [
    { upTo: 58_523, rate: 0.064, k: 0 },
    { upTo: 117_045, rate: 0.09, k: 1_522 },
    { upTo: 181_440, rate: 0.109, k: 3_745 },
    { upTo: 500_000, rate: 0.128, k: 7_193 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.15, k: 18_193 },
  ],
};

export const ONTARIO_TAX_2026 = {
  basicPersonal: 12_989,
  lowestRate: 0.0505,
  surtaxFirst: 5_818,
  surtaxSecond: 7_446,
  reductionBasic: 300,
  verified: true,
  asOf: RATE_AS_OF,
  source:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html",
} as const;

/**
 * Bracket tables are published for these provinces.
 * Dollar tax is estimated only for Ontario, where the personal amount, surtax,
 * health premium, and reduction were on the same CRA page.
 * Quebec tax follows TP-1015.F and was not loaded. It is not estimated.
 */
export const PROVINCIAL_TAX_READY = new Set(["ON"]);

export const SALES_TAX_2026 = {
  /** Child care that meets Memorandum 21-1 is exempt. Taxable extras use these rates. */
  exemptionSource:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/21-1/child-care-services.html",
  gstRate: 0.05,
  hst: { ON: 0.13, NB: 0.15, NL: 0.15, PE: 0.15 } as Record<string, number>,
  /** Nova Scotia's HST change was not re-checked on 22 Nov 2026. */
  novaScotiaVerified: false,
  /** Provincial sales tax on extras was not verified for childcare. */
  pstVerified: false,
  /** The 9.975% QST rate was not re-fetched as its own page in this build. */
  qstVerified: false,
  verifiedProvinces: ["AB", "BC", "MB", "NB", "NL", "NT", "NU", "ON", "PE", "SK", "YT", "QC"] as const,
} as const;

/** Ontario ESA: 1.5× after 44 hours in a week. No daily threshold. Other provinces are not estimated. */
export const OVERTIME_2026 = {
  ON: {
    weeklyHours: 44,
    dailyHours: null as number | null,
    multiplier: 1.5,
    verified: true,
    source: "https://www.ontario.ca/document/your-guide-employment-standards-act-0/overtime-pay",
  },
} as const;

export const PERIODS: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type ProvinceCode = (typeof PROVINCES)[number];

export function isProvince(value: string): value is ProvinceCode {
  return (PROVINCES as readonly string[]).includes(value);
}
