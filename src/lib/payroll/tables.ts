/**
 * Official payroll tables, by edition.
 *
 * Every figure here was copied from a saved CRA CSV (T4127 Table 8.1, 8.2,
 * and the CPP/QPP/EI/QPIP tables) or from a Revenu Québec page. Do not
 * retype from memory. When a new edition comes out, add a new object and a
 * new branch in `editionForPayDate`.
 *
 * Money in this file is in dollars, as CRA prints it. The engine turns every
 * result into integer cents.
 */

export const PROVINCE_CODES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type Province = (typeof PROVINCE_CODES)[number];
export type NonQuebec = Exclude<Province, "QC">;

/** One bracket row. `from` is the threshold A, `rate` is R or V, `k` is K or KP. */
export type Bracket = { from: number; rate: number; k: number };

export type PensionPlan = {
  ympe: number;
  yampe: number;
  exemption: number;
  totalRate: number;
  baseRate: number;
  firstAdditionalRate: number;
  secondRate: number;
  maxTotal: number;
  maxBase: number;
  maxSecond: number;
};

export type EiTable = {
  maxInsurable: number;
  rate: number;
  employerRate: number;
  maxPremium: number;
  maxEmployer: number;
};

export type QpipTable = {
  maxInsurable: number;
  employeeRate: number;
  employerRate: number;
  maxEmployee: number;
  maxEmployer: number;
};

export type ProvinceTable = {
  brackets: readonly Bracket[];
  /** Table 8.2 basic amount. `formula` means BPAMB (Manitoba) or BPAYT (Yukon). */
  basic: number | "formula";
  /** Labour-sponsored funds credit rate and annual cap (Table 8.2). Not used until a TD1 asks for it. */
  lcp?: { rate: number; max: number };
};

export type Edition = {
  id: "T4127-123" | "T4127-124";
  /** Shown on every pay stub line. */
  label: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  asOf: string;
  source: string;
  federal: {
    brackets: readonly Bracket[];
    lowestRate: number;
    bpaf: { max: number; min: number; low: number; high: number };
    cea: number;
    quebecAbatement: number;
    lcp: { rate: number; max: number };
  };
  cpp: PensionPlan;
  qpp: PensionPlan;
  ei: EiTable;
  eiQuebec: EiTable;
  qpip: QpipTable;
  provinces: Record<NonQuebec, ProvinceTable>;
  /** Province rules that are not plain brackets. */
  special: {
    /** Manitoba basic amount, phased out between `low` and `high` net income. */
    bpamb: { max: number; low: number; high: number };
    /** Alberta supplemental credit K5P = ((K1P + K2P) - threshold) x rate. */
    albertaK5p: { threshold: number; rate: number };
    /** BC tax reduction S. */
    bcReduction: { amount: number; low: number; high: number; rate: number };
    /** Ontario surtax V1 tiers on basic provincial tax T4. */
    ontarioSurtax: readonly { over: number; rate: number }[];
    /** Ontario tax reduction S2, and Y per eligible dependant. */
    ontarioReduction: { s2: number; perDependant: number };
    /** Yukon Canada employment amount for K4P. */
    yukonCea: number;
  };
  /** Table pages a person can open. */
  links: { formulas: string; tables: string };
};

const T4127_123_FORMULAS =
  "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/payroll-deductions-t4127-payroll-deductions-formulas/t4127-jul-123rd-edition-effective-july-1-2026/t4127-jul-payroll-deductions-formulas.html";
const T4127_122_FORMULAS =
  "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/payroll-deductions-t4127-payroll-deductions-formulas/t4127-jan-122nd-edition-effective-january-1-2026/t4127-jan-payroll-deductions-formulas-computer-programs.html";
const T4127_124_FORMULAS =
  "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html";
const T4032_INDEX = "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables.html";

function rows(a: readonly number[], r: readonly number[], k: readonly number[]): Bracket[] {
  return a.map((from, index) => ({ from, rate: r[index], k: k[index] }));
}

/**
 * T4127 123rd edition, effective July 1, 2026.
 * Table 8.1 and 8.2 from the saved CSV (payroll-src/2026-07).
 * CPP, QPP, EI, and QPIP are unchanged from January 2026 (122nd edition tables 8.3 to 8.8).
 * Items not reprinted in the July edition (BPAF, BPAMB, K5P, Ontario S and V1, Yukon CEA)
 * come from the 122nd edition, as the July edition tells payroll software to do.
 */
export const T4127_2026_07: Edition = {
  id: "T4127-123",
  label: "CRA T4127 123rd edition (July 1, 2026)",
  effectiveFrom: "2026-07-01",
  effectiveTo: "2026-12-31",
  asOf: "2026-11-22",
  source: T4127_123_FORMULAS,
  federal: {
    brackets: rows([0, 58_523, 117_045, 181_440, 258_482], [0.14, 0.205, 0.26, 0.29, 0.33], [0, 3_804, 10_241, 15_685, 26_024]),
    lowestRate: 0.14,
    bpaf: { max: 16_452, min: 14_829, low: 181_440, high: 258_482 },
    cea: 1_501,
    quebecAbatement: 0.165,
    lcp: { rate: 0.15, max: 750 },
  },
  cpp: {
    ympe: 74_600,
    yampe: 85_000,
    exemption: 3_500,
    totalRate: 0.0595,
    baseRate: 0.0495,
    firstAdditionalRate: 0.01,
    secondRate: 0.04,
    maxTotal: 4_230.45,
    maxBase: 3_519.45,
    maxSecond: 416,
  },
  qpp: {
    ympe: 74_600,
    yampe: 85_000,
    exemption: 3_500,
    totalRate: 0.063,
    baseRate: 0.053,
    firstAdditionalRate: 0.01,
    secondRate: 0.04,
    maxTotal: 4_479.3,
    maxBase: 3_768.3,
    maxSecond: 416,
  },
  ei: { maxInsurable: 68_900, rate: 0.0163, employerRate: 0.02282, maxPremium: 1_123.07, maxEmployer: 1_572.3 },
  eiQuebec: { maxInsurable: 68_900, rate: 0.013, employerRate: 0.0182, maxPremium: 895.7, maxEmployer: 1_253.98 },
  qpip: { maxInsurable: 103_000, employeeRate: 0.0043, employerRate: 0.00602, maxEmployee: 442.9, maxEmployer: 620.06 },
  provinces: {
    AB: { brackets: rows([0, 61_200, 154_259, 185_111, 246_813, 370_220], [0.08, 0.1, 0.12, 0.13, 0.14, 0.15], [0, 1_224, 4_309, 6_160, 8_628, 12_331]), basic: 22_769 },
    BC: {
      // July 2026: lowest rate prorated to 6.14% for July to December (Option 1).
      brackets: rows(
        [0, 50_363, 100_728, 115_648, 140_430, 190_405, 265_545],
        [0.0614, 0.077, 0.105, 0.1229, 0.147, 0.168, 0.205],
        [0, 786, 3_606, 5_676, 9_061, 13_059, 22_884],
      ),
      basic: 13_216,
    },
    MB: { brackets: rows([0, 47_000, 100_000], [0.108, 0.1275, 0.174], [0, 917, 5_567]), basic: "formula", lcp: { rate: 0.15, max: 1_800 } },
    NB: { brackets: rows([0, 52_333, 104_666, 193_861], [0.094, 0.14, 0.16, 0.195], [0, 2_407, 4_501, 11_286]), basic: 13_664, lcp: { rate: 0.2, max: 2_000 } },
    NL: {
      // July 2026: basic amount prorated to $15,000 for July to December (Option 1).
      brackets: rows(
        [0, 44_678, 89_354, 159_528, 223_340, 285_319, 570_638, 1_141_275],
        [0.087, 0.145, 0.158, 0.178, 0.198, 0.208, 0.213, 0.218],
        [0, 2_591, 3_753, 6_943, 11_410, 14_263, 17_117, 22_823],
      ),
      basic: 15_000,
    },
    NS: { brackets: rows([0, 30_995, 61_991, 97_417, 157_124], [0.0879, 0.1495, 0.1667, 0.175, 0.21], [0, 1_909, 2_976, 3_784, 9_283]), basic: 11_932, lcp: { rate: 0.2, max: 2_000 } },
    NT: { brackets: rows([0, 53_003, 106_009, 172_346], [0.059, 0.086, 0.122, 0.1405], [0, 1_431, 5_247, 8_436]), basic: 18_198 },
    NU: { brackets: rows([0, 55_801, 111_602, 181_439], [0.04, 0.07, 0.09, 0.115], [0, 1_674, 3_906, 8_442]), basic: 19_659 },
    ON: { brackets: rows([0, 53_891, 107_785, 150_000, 220_000], [0.0505, 0.0915, 0.1116, 0.1216, 0.1316], [0, 2_210, 4_376, 5_876, 8_076]), basic: 12_989 },
    PE: {
      // July 2026: new $200,000 bracket, prorated 21% for July to December (Option 1).
      brackets: rows([0, 33_928, 65_820, 106_890, 142_520, 200_000], [0.095, 0.1347, 0.166, 0.1762, 0.19, 0.21], [0, 1_347, 3_407, 4_497, 6_464, 10_464]),
      basic: 15_000,
    },
    SK: { brackets: rows([0, 54_532, 155_805], [0.105, 0.125, 0.145], [0, 1_091, 4_207]), basic: 20_381, lcp: { rate: 0.175, max: 875 } },
    YT: { brackets: rows([0, 58_523, 117_045, 181_440, 500_000], [0.064, 0.09, 0.109, 0.128, 0.15], [0, 1_522, 3_745, 7_193, 18_193]), basic: "formula" },
  },
  special: {
    bpamb: { max: 15_780, low: 200_000, high: 400_000 },
    albertaK5p: { threshold: 4_896, rate: 0.25 },
    // July 2026 Option 1: prorated $805, phased out from $25,570 to $44,952 at 3.56%.
    bcReduction: { amount: 805, low: 25_570, high: 44_952, rate: 0.0356 },
    ontarioSurtax: [
      { over: 5_818, rate: 0.2 },
      { over: 7_446, rate: 0.36 },
    ],
    ontarioReduction: { s2: 300, perDependant: 554 },
    yukonCea: 1_501,
  },
  links: { formulas: T4127_123_FORMULAS, tables: T4032_INDEX },
};

/**
 * T4127 124th edition, effective January 1, 2027.
 * Table 8.1, 8.2, and 8.3 to 8.8 from the saved CSV (payroll-src/2027).
 *
 * CPP note: the 2027 tables print a base CPP rate of 4.75% and a total
 * employee rate of 5.75% (2026: 4.95% and 5.95%). CRA's page calls the base
 * rate cut announced. We use the published table as printed. Re-check it
 * against the final January 2027 tables before the first 2027 pay day.
 */
export const T4127_2027: Edition = {
  id: "T4127-124",
  label: "CRA T4127 124th edition (January 1, 2027)",
  effectiveFrom: "2027-01-01",
  effectiveTo: null,
  asOf: "2026-11-22",
  source: T4127_124_FORMULAS,
  federal: {
    brackets: rows([0, 60_044, 120_088, 186_157, 265_203], [0.14, 0.205, 0.26, 0.29, 0.33], [0, 3_903, 10_508, 16_092, 26_701]),
    lowestRate: 0.14,
    bpaf: { max: 16_879, min: 15_214, low: 186_157, high: 265_203 },
    cea: 1_540,
    quebecAbatement: 0.165,
    lcp: { rate: 0.15, max: 750 },
  },
  cpp: {
    ympe: 76_700,
    yampe: 87_400,
    exemption: 3_500,
    totalRate: 0.0575,
    baseRate: 0.0475,
    firstAdditionalRate: 0.01,
    secondRate: 0.04,
    maxTotal: 4_209,
    maxBase: 3_477,
    maxSecond: 428,
  },
  qpp: {
    ympe: 76_700,
    yampe: 87_400,
    exemption: 3_500,
    totalRate: 0.063,
    baseRate: 0.053,
    firstAdditionalRate: 0.01,
    secondRate: 0.04,
    maxTotal: 4_611.6,
    maxBase: 3_879.6,
    maxSecond: 428,
  },
  ei: { maxInsurable: 70_800, rate: 0.0164, employerRate: 0.02296, maxPremium: 1_161.12, maxEmployer: 1_625.57 },
  eiQuebec: { maxInsurable: 70_800, rate: 0.0129, employerRate: 0.01806, maxPremium: 913.32, maxEmployer: 1_278.65 },
  qpip: { maxInsurable: 106_000, employeeRate: 0.0043, employerRate: 0.00602, maxEmployee: 455.8, maxEmployer: 638.12 },
  provinces: {
    AB: { brackets: rows([0, 62_424, 157_344, 188_813, 251_750, 377_625], [0.08, 0.1, 0.12, 0.13, 0.14, 0.15], [0, 1_248, 4_395, 6_283, 8_801, 12_577]), basic: 23_225 },
    BC: {
      brackets: rows(
        [0, 50_363, 100_728, 115_648, 140_430, 190_405, 265_545],
        [0.056, 0.077, 0.105, 0.1229, 0.147, 0.168, 0.205],
        [0, 1_058, 3_878, 5_948, 9_332, 13_331, 23_156],
      ),
      basic: 13_216,
    },
    MB: { brackets: rows([0, 47_000, 100_000], [0.108, 0.1275, 0.174], [0, 917, 5_567]), basic: "formula", lcp: { rate: 0.15, max: 1_800 } },
    NB: { brackets: rows([0, 53_693, 107_388, 198_902], [0.094, 0.14, 0.16, 0.195], [0, 2_470, 4_618, 11_579]), basic: 14_019, lcp: { rate: 0.2, max: 2_000 } },
    NL: {
      brackets: rows(
        [0, 46_152, 92_303, 164_792, 230_710, 294_734, 589_469, 1_178_938],
        [0.087, 0.145, 0.158, 0.178, 0.198, 0.208, 0.213, 0.218],
        [0, 2_677, 3_877, 7_173, 11_787, 14_734, 17_681, 23_576],
      ),
      basic: 15_495,
    },
    NS: { brackets: rows([0, 32_080, 64_160, 100_827, 162_624], [0.0879, 0.1495, 0.1667, 0.175, 0.21], [0, 1_976, 3_080, 3_917, 9_608]), basic: 12_350, lcp: { rate: 0.2, max: 2_000 } },
    NT: { brackets: rows([0, 54_381, 108_765, 176_827], [0.059, 0.086, 0.122, 0.1405], [0, 1_468, 5_384, 8_655]), basic: 18_672 },
    NU: { brackets: rows([0, 57_252, 114_503, 186_156], [0.04, 0.07, 0.09, 0.115], [0, 1_718, 4_008, 8_662]), basic: 20_170 },
    ON: { brackets: rows([0, 55_023, 110_049, 150_000, 220_000], [0.0505, 0.0915, 0.1116, 0.1216, 0.1316], [0, 2_256, 4_468, 5_968, 8_168]), basic: 13_261 },
    PE: { brackets: rows([0, 33_928, 65_820, 106_890, 142_520, 200_000], [0.095, 0.1347, 0.166, 0.1762, 0.19, 0.2], [0, 1_347, 3_407, 4_497, 6_464, 8_464]), basic: 15_000 },
    // SK basic includes the extra $500 from the Saskatchewan Affordability Act (Table 8.2 note).
    SK: { brackets: rows([0, 55_950, 159_856], [0.105, 0.125, 0.145], [0, 1_119, 4_316]), basic: 21_411, lcp: { rate: 0.175, max: 875 } },
    YT: { brackets: rows([0, 60_044, 120_088, 186_157, 500_000], [0.064, 0.09, 0.109, 0.128, 0.15], [0, 1_561, 3_843, 7_380, 18_380]), basic: "formula" },
  },
  special: {
    bpamb: { max: 15_780, low: 200_000, high: 400_000 },
    albertaK5p: { threshold: 4_993.92, rate: 0.25 },
    bcReduction: { amount: 690, low: 25_570, high: 41_722, rate: 0.0356 },
    ontarioSurtax: [
      { over: 5_940, rate: 0.2 },
      { over: 7_603, rate: 0.36 },
    ],
    ontarioReduction: { s2: 306, perDependant: 566 },
    yukonCea: 1_540,
  },
  links: { formulas: T4127_124_FORMULAS, tables: T4032_INDEX },
};

/**
 * Quebec income tax, Revenu Québec, 2026.
 * Brackets and personal amounts: "Employers: Principal changes for 2026".
 * Deduction for workers and the QPP deduction: "Reducing the remuneration
 * subject to source deductions of income tax".
 * Formula shape (guide TP-1015.F-V, 2026-01): I = P x (G - F - H - CSA) - J - J1,
 * Y = T x I - K - K1 - 0.14 x E, deduction per pay = Y / P + L.
 * The TP-1015.F-V PDF blocks automated readers, so the formula shape was
 * read from a quoted copy, not from the PDF itself. It is marked that way.
 */
export const QUEBEC_2026 = {
  id: "TP-1015.F-V-2026",
  label: "Revenu Québec TP-1015.F-V (2026)",
  year: 2026,
  asOf: "2026-11-22",
  brackets: [
    { from: 0, rate: 0.14, k: 0 },
    { from: 54_345, rate: 0.19, k: 2_717 },
    { from: 108_680, rate: 0.24, k: 8_151 },
    { from: 132_245, rate: 0.2575, k: 10_465 },
  ] as readonly Bracket[],
  creditRate: 0.14,
  basicPersonal: 18_952,
  workerDeduction: { rate: 0.06, max: 1_450 },
  formulaReadFromPdf: false,
  sources: {
    amounts: "https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/employers-principal-changes-for-2026/",
    deductions:
      "https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/source-deductions-of-quebec-income-tax/reducing-the-remuneration-subject-to-source-deductions/",
    guide: "https://www.revenuquebec.ca/en/online-services/forms-and-publications/current-details/tp-1015-f-v/",
  },
} as const;

export type QuebecTable = typeof QUEBEC_2026;

export const EDITIONS: readonly Edition[] = [T4127_2026_07, T4127_2027];

/** The CRA edition for a pay date. Pay dates before July 1, 2026 have no table here. */
export function editionForPayDate(payDate: string): Edition | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) return null;
  if (payDate >= T4127_2027.effectiveFrom) return T4127_2027;
  if (payDate >= T4127_2026_07.effectiveFrom) return T4127_2026_07;
  return null;
}

/** Revenu Québec table for a pay date. 2027 was not published when this was built. */
export function quebecForPayDate(payDate: string): QuebecTable | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) return null;
  if (payDate.startsWith("2026-")) return QUEBEC_2026;
  return null;
}

export function isProvinceCode(value: string): value is Province {
  return (PROVINCE_CODES as readonly string[]).includes(value);
}

export const PAY_PERIODS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 } as const;
export type Frequency = keyof typeof PAY_PERIODS;

export { T4127_122_FORMULAS };
