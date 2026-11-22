/**
 * Source-deduction engine for all 13 provinces and territories.
 *
 * Federal and provincial tax: CRA T4127 Option 1 (annualized), Chapter 4.
 * CPP, CPP2, QPP, EI, QPIP: T4127 Chapter 6 formulas for salary and wages.
 * Quebec income tax: Revenu Québec TP-1015.F-V formula shape.
 *
 * Rules followed:
 * - Rate ratios are not rounded.
 * - The CPP basic exemption per pay drops the third decimal (truncates).
 * - Per-pay CPP, EI, QPIP, and tax round half up to the cent.
 * - Every result is integer cents and every line names its table edition.
 */

import {
  editionForPayDate,
  quebecForPayDate,
  PAY_PERIODS,
  type Bracket,
  type Edition,
  type Frequency,
  type NonQuebec,
  type Province,
  type QuebecTable,
} from "./tables.ts";

export type EngineInput = {
  province: Province;
  frequency: Frequency;
  payDate: string;
  /** Taxable cash and taxable benefits this pay, in cents (I). */
  taxableCents: number;
  /** Pensionable earnings this pay, in cents (PI). */
  pensionableCents: number;
  /** Insurable earnings this pay, in cents (IE). */
  insurableCents: number;
  /** RRSP or RPP taken off this pay (F). */
  rrspCents?: number;
  /** Year to date before this pay. */
  ytd?: {
    pensionableCents?: number;
    cppCents?: number;
    cpp2Cents?: number;
    eiCents?: number;
    qpipCents?: number;
  };
  /** TD1 federal total claim (TC). Empty means the basic personal amount for this income. */
  td1FederalCents?: number | null;
  /** TD1 provincial total claim (TCP), or TP-1015.3 line 10 (E) for Quebec. */
  td1ProvincialCents?: number | null;
  /** Ontario Y: eligible dependants on TD1ON. */
  ontarioDependants?: number;
  cppExempt?: boolean;
  eiExempt?: boolean;
  /** Months of pensionable service in the year (PM). Default 12. */
  pensionMonths?: number;
  /**
   * "t4127" (default) uses this pay's real CPP and CPP2, as payroll software must.
   * "t4032" spreads CPP and CPP2 evenly over the year, the way CRA builds the
   * printed T4032 tables. Used to check the engine against those tables.
   */
  method?: "t4127" | "t4032";
};

export type EngineLine = {
  code:
    | "cpp"
    | "cpp2"
    | "qpp"
    | "qpp2"
    | "ei"
    | "qpip"
    | "federal_tax"
    | "provincial_tax"
    | "employer_cpp"
    | "employer_cpp2"
    | "employer_qpp"
    | "employer_qpp2"
    | "employer_ei"
    | "employer_qpip";
  cents: number;
  edition: string;
  asOf: string;
  source: string;
  verified: boolean;
};

export type EngineResult =
  | {
      ok: true;
      edition: Edition;
      quebec: QuebecTable | null;
      periods: number;
      cppCents: number;
      cpp2Cents: number;
      eiCents: number;
      qpipCents: number;
      federalTaxCents: number;
      provincialTaxCents: number | null;
      employerCppCents: number;
      employerCpp2Cents: number;
      employerEiCents: number;
      employerQpipCents: number;
      /** Annual figures used, for the "how we got this" screen and tests. */
      annual: {
        taxableIncome: number;
        federalTax: number;
        provincialTax: number | null;
        federalClaim: number;
        provincialClaim: number | null;
      };
      lines: EngineLine[];
      notes: string[];
    }
  | { ok: false; reason: "no_table" | "no_quebec_table"; message: string };

/** Round half up to the cent, the T4127 "third digit" rule. */
export function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;
}

/** Drop the third decimal. Used for the CPP basic exemption per pay. */
export function trunc2(value: number): number {
  return Math.floor(value * 100 + 1e-7) / 100;
}

function toCents(dollars: number): number {
  return Math.round(round2(dollars) * 100);
}

function bracketFor(income: number, table: readonly Bracket[]): Bracket {
  let row = table[0];
  for (const item of table) {
    if (income >= item.from) row = item;
  }
  return row;
}

/** Federal basic personal amount (BPAF), phased down for high net income. */
export function bpaf(netIncome: number, edition: Edition): number {
  const { max, min, low, high } = edition.federal.bpaf;
  if (netIncome <= low) return max;
  if (netIncome >= high) return min;
  return round2(max - (netIncome - low) * ((max - min) / (high - low)));
}

/** Manitoba basic personal amount (BPAMB). */
export function bpamb(netIncome: number, edition: Edition): number {
  const { max, low, high } = edition.special.bpamb;
  if (netIncome <= low) return max;
  if (netIncome >= high) return 0;
  return round2(max - (netIncome - low) * (max / (high - low)));
}

function provincialBasic(province: NonQuebec, netIncome: number, edition: Edition): number {
  const basic = edition.provinces[province].basic;
  if (basic !== "formula") return basic;
  if (province === "MB") return bpamb(netIncome, edition);
  // BPAYT equals BPAF (Yukon harmonizes with the federal amount).
  return bpaf(netIncome, edition);
}

function ontarioHealthPremium(a: number): number {
  if (a <= 20_000) return 0;
  if (a <= 36_000) return Math.min(300, round2(0.06 * (a - 20_000)));
  if (a <= 48_000) return Math.min(450, round2(300 + 0.06 * (a - 36_000)));
  if (a <= 72_000) return Math.min(600, round2(450 + 0.25 * (a - 48_000)));
  if (a <= 200_000) return Math.min(750, round2(600 + 0.25 * (a - 72_000)));
  return Math.min(900, round2(750 + 0.25 * (a - 200_000)));
}

function ontarioSurtax(t4: number, edition: Edition): number {
  let v1 = 0;
  for (const tier of edition.special.ontarioSurtax) {
    if (t4 > tier.over) v1 += tier.rate * (t4 - tier.over);
  }
  return round2(v1);
}

function bcReduction(a: number, t4: number, edition: Edition): number {
  const { amount, low, high, rate } = edition.special.bcReduction;
  if (a <= low) return Math.min(t4, amount);
  if (a <= high) return Math.max(0, Math.min(t4, round2(amount - (a - low) * rate)));
  return 0;
}

export function calculateDeductions(input: EngineInput): EngineResult {
  const edition = editionForPayDate(input.payDate);
  if (!edition) {
    return {
      ok: false,
      reason: "no_table",
      message: "KidEase has CRA tables for pay dates from July 1, 2026. Pick a later pay date.",
    };
  }
  const province = input.province;
  const isQuebec = province === "QC";
  const quebecTable = isQuebec ? quebecForPayDate(input.payDate) : null;
  if (isQuebec && !quebecTable) {
    // Never give a pay with Quebec tax missing. Block the whole calculation.
    return {
      ok: false,
      reason: "no_quebec_table",
      message: "Revenu Québec has not published its tables for this pay date in KidEase yet. Quebec pay is blocked until it is added.",
    };
  }
  const P = PAY_PERIODS[input.frequency];
  const PM = Math.min(12, Math.max(0, input.pensionMonths ?? 12));
  const notes: string[] = [];

  const I = Math.max(0, input.taxableCents) / 100;
  const PI = Math.max(0, input.pensionableCents) / 100;
  const IE = Math.max(0, input.insurableCents) / 100;
  const F = Math.max(0, input.rrspCents ?? 0) / 100;
  const ytd = input.ytd ?? {};
  const PIYTD = Math.max(0, ytd.pensionableCents ?? 0) / 100;
  const D = Math.max(0, ytd.cppCents ?? 0) / 100;
  const D2 = Math.max(0, ytd.cpp2Cents ?? 0) / 100;
  const D1 = Math.max(0, ytd.eiCents ?? 0) / 100;
  const DQPIP = Math.max(0, ytd.qpipCents ?? 0) / 100;

  // CPP or QPP (C) and the second additional contribution (C2).
  const plan = isQuebec ? edition.qpp : edition.cpp;
  let C = 0;
  let C2 = 0;
  if (!input.cppExempt && PI > 0) {
    const exemptionPerPay = trunc2(plan.exemption / P);
    const room = round2(plan.maxTotal * (PM / 12) - D);
    C = Math.max(0, Math.min(room, round2(plan.totalRate * Math.max(0, PI - exemptionPerPay))));
    const W = Math.max(PIYTD, plan.ympe * (PM / 12));
    const room2 = round2(plan.maxSecond * (PM / 12) - D2);
    C2 = Math.max(0, Math.min(room2, round2((PIYTD + PI - W) * plan.secondRate)));
  }

  // EI.
  const ei = isQuebec ? edition.eiQuebec : edition.ei;
  const EI = input.eiExempt || IE <= 0 ? 0 : Math.max(0, Math.min(round2(ei.maxPremium - D1), round2(ei.rate * IE)));

  // QPIP (Quebec only). QPIP follows the province, not EI exemption, but an
  // EI-exempt worker in this build is also treated as QPIP-exempt and noted.
  let QPIP = 0;
  if (isQuebec && IE > 0 && !input.eiExempt) {
    const q = edition.qpip;
    QPIP = Math.max(0, Math.min(round2(q.maxEmployee - DQPIP), round2(q.employeeRate * Math.min(IE, q.maxInsurable))));
  }

  // Federal tax, Option 1.
  const F5 = C === 0 && C2 === 0 ? 0 : C * (plan.firstAdditionalRate / plan.totalRate) + C2;
  let annualF5 = P * F5;
  if (input.method === "t4032" && !input.cppExempt) {
    const yearly = P * PI;
    const firstAdditional = Math.min(P * C, plan.maxTotal) * (plan.firstAdditionalRate / plan.totalRate);
    const second = Math.min(Math.max(0, Math.min(yearly, plan.yampe) - plan.ympe) * plan.secondRate, plan.maxSecond);
    annualF5 = firstAdditional + second;
  }
  const A = Math.max(0, P * (I - F) - annualF5);
  const NI = A;
  const R = bracketFor(A, edition.federal.brackets);
  const TC = input.td1FederalCents != null ? Math.max(0, input.td1FederalCents) / 100 : bpaf(NI, edition);
  const lowest = edition.federal.lowestRate;
  const K1 = lowest * TC;
  const basePart = plan.baseRate / plan.totalRate;
  const cppCreditBase = Math.min(P * C * basePart, plan.maxBase * (PM / 12));
  const eiCreditBase = Math.min(P * EI, ei.maxPremium);
  const qpipCreditBase = isQuebec ? Math.min(P * IE * edition.qpip.employeeRate, edition.qpip.maxEmployee) : 0;
  const K2 = lowest * cppCreditBase + lowest * eiCreditBase + lowest * qpipCreditBase;
  const K4 = Math.min(lowest * A, lowest * edition.federal.cea);
  const T3 = Math.max(0, R.rate * A - R.k - K1 - K2 - K4);
  const T1 = isQuebec ? Math.max(0, T3 - edition.federal.quebecAbatement * T3) : T3;

  // Provincial tax.
  let T2: number | null = null;
  let TCP: number | null = null;
  let provincialVerified = true;
  if (!isQuebec) {
    const code = province as NonQuebec;
    const table = edition.provinces[code];
    const V = bracketFor(A, table.brackets);
    const lowRate = table.brackets[0].rate;
    TCP = input.td1ProvincialCents != null ? Math.max(0, input.td1ProvincialCents) / 100 : provincialBasic(code, NI, edition);
    const K1P = lowRate * TCP;
    const K2P = lowRate * cppCreditBase + lowRate * eiCreditBase;
    const K4P = code === "YT" ? Math.min(lowRate * A, lowRate * edition.special.yukonCea) : 0;
    const K5P = code === "AB" ? Math.max(0, (K1P + K2P - edition.special.albertaK5p.threshold) * edition.special.albertaK5p.rate) : 0;
    const T4 = Math.max(0, V.rate * A - V.k - K1P - K2P - K4P - K5P);
    let V1 = 0;
    let V2 = 0;
    let S = 0;
    if (code === "ON") {
      V1 = ontarioSurtax(T4, edition);
      V2 = ontarioHealthPremium(A);
      const y = Math.max(0, Math.floor(input.ontarioDependants ?? 0)) * edition.special.ontarioReduction.perDependant;
      S = Math.max(0, Math.min(T4 + V1, 2 * (edition.special.ontarioReduction.s2 + y) - (T4 + V1)));
    } else if (code === "BC") {
      S = bcReduction(A, T4, edition);
    }
    T2 = Math.max(0, T4 + V1 + V2 - S);
  } else if (quebecTable) {
    // Quebec: I = P x (G - F - H - CSA) - J - J1; Y = T x I - K - K1 - 0.14 x E.
    const H = Math.min(quebecTable.workerDeduction.rate * I, quebecTable.workerDeduction.max / P);
    const CSA = C === 0 && C2 === 0 ? 0 : C * (plan.firstAdditionalRate / plan.totalRate) + C2;
    const QI = Math.max(0, P * (I - F - H - CSA));
    const row = bracketFor(QI, quebecTable.brackets);
    TCP = input.td1ProvincialCents != null ? Math.max(0, input.td1ProvincialCents) / 100 : quebecTable.basicPersonal;
    T2 = Math.max(0, row.rate * QI - row.k - quebecTable.creditRate * TCP);
    provincialVerified = quebecTable.formulaReadFromPdf;
    notes.push("Quebec tax uses Revenu Québec amounts. The formula shape was read from a quoted copy of TP-1015.F-V, not the PDF.");
  }

  // Per-pay tax. Combined T is rounded once, then split so the parts add up.
  const federalPer = toCents(T1 / P);
  let provincialPer: number | null = null;
  if (T2 != null) {
    const combined = toCents(isQuebec ? T1 / P : (T1 + T2) / P);
    provincialPer = isQuebec ? toCents(T2 / P) : combined - federalPer;
  }

  const cppCents = toCents(C);
  const cpp2Cents = toCents(C2);
  const eiCents = toCents(EI);
  const qpipCents = toCents(QPIP);
  const employerEiCents = Math.round(eiCents * 1.4);
  const employerQpipCents = isQuebec
    ? toCents(Math.max(0, Math.min(edition.qpip.employerRate * Math.min(IE, edition.qpip.maxInsurable), edition.qpip.maxEmployer - DQPIP * (edition.qpip.employerRate / edition.qpip.employeeRate))))
    : 0;
  const tag = { edition: edition.label, asOf: edition.asOf, source: edition.source, verified: true };
  const pensionCode = isQuebec ? "qpp" : "cpp";
  const lines: EngineLine[] = [
    { code: pensionCode, cents: cppCents, ...tag },
    { code: isQuebec ? "qpp2" : "cpp2", cents: cpp2Cents, ...tag },
    { code: "ei", cents: eiCents, ...tag },
    ...(isQuebec ? [{ code: "qpip" as const, cents: qpipCents, ...tag }] : []),
    { code: "federal_tax", cents: federalPer, ...tag },
    ...(provincialPer != null
      ? [
          {
            code: "provincial_tax" as const,
            cents: provincialPer,
            edition: isQuebec && quebecTable ? quebecTable.label : edition.label,
            asOf: isQuebec && quebecTable ? quebecTable.asOf : edition.asOf,
            source: isQuebec && quebecTable ? quebecTable.sources.guide : edition.source,
            verified: provincialVerified,
          },
        ]
      : []),
    { code: isQuebec ? "employer_qpp" : "employer_cpp", cents: cppCents, ...tag },
    { code: isQuebec ? "employer_qpp2" : "employer_cpp2", cents: cpp2Cents, ...tag },
    { code: "employer_ei", cents: employerEiCents, ...tag },
    ...(isQuebec ? [{ code: "employer_qpip" as const, cents: employerQpipCents, ...tag }] : []),
  ];

  return {
    ok: true,
    edition,
    quebec: quebecTable,
    periods: P,
    cppCents,
    cpp2Cents,
    eiCents,
    qpipCents,
    federalTaxCents: federalPer,
    provincialTaxCents: provincialPer,
    employerCppCents: cppCents,
    employerCpp2Cents: cpp2Cents,
    employerEiCents,
    employerQpipCents,
    annual: {
      taxableIncome: round2(A),
      federalTax: round2(T1),
      provincialTax: T2 == null ? null : round2(T2),
      federalClaim: round2(TC),
      provincialClaim: TCP == null ? null : round2(TCP),
    },
    lines,
    notes,
  };
}

/** Provinces whose provincial tax the engine computes for a pay date. */
export function provincialTaxReady(province: Province, payDate: string): boolean {
  if (!editionForPayDate(payDate)) return false;
  if (province === "QC") return quebecForPayDate(payDate) != null;
  return true;
}
