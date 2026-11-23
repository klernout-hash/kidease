/**
 * Pay-day calculation.
 *
 * Deductions come from `engine.ts`: CRA T4127 Option 1 for federal and
 * provincial tax in all 13 provinces and territories, the CPP, CPP2, QPP, EI,
 * and QPIP formulas, and Revenu Québec's formula for Quebec tax. The table
 * edition is picked by pay date. Each money line names its edition and as-of
 * date. The owner still checks it before approving.
 */

import { cents, roundDollars } from "./money.ts";
import { calculateDeductions, type EngineLine } from "./engine.ts";
import { isProvinceCode, type Frequency } from "./tables.ts";
import { PERIODS, PROVINCIAL_TAX_READY } from "./rates-2026.ts";

export const ESTIMATE_LABEL = "Worked out with CRA and Revenu Québec formulas. Check it before you approve. You send the money from your own bank.";

/** Pay date used when a caller does not give one. */
export const DEFAULT_PAY_DATE = "2026-11-22";

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export type AddonKind =
  | "bonus"
  | "overtime"
  | "stat"
  | "vacation_taken"
  | "sick_pay"
  | "reimbursement"
  | "training"
  | "childcare_discount"
  | "advance"
  | "advance_repay"
  | "tip"
  | "gift";

export type PayAddon = {
  kind: AddonKind;
  amountCents: number;
  /** Centre's choice when the CRA treatment is not a simple yes. */
  taxable?: boolean;
  /** controlled tips are treated as wages. direct tips are not. Unverified either way. */
  tipControl?: "controlled" | "direct";
  recurring?: boolean;
};

export type PayYtd = {
  pensionableCents: number;
  cppOrQppCents: number;
  cpp2Cents: number;
  insurableCents: number;
  eiCents: number;
  qpipInsurableCents: number;
  qpipCents: number;
};

export type PayInput = {
  province: string;
  frequency: PayFrequency;
  /** Regular wages for the period, before vacation percent and add-ons. */
  regularGrossCents: number;
  /** Vacation percent in basis points. 400 = 4%. Paid out this period when mode is payout. */
  vacationBps: number;
  vacationMode: "payout" | "bank";
  ytd?: Partial<PayYtd>;
  /** Bonus entered on the pay card, in cents. Taxed with CRA's bonus method. */
  bonusCents?: number;
  /** Bonuses already paid this year, in cents. */
  ytdBonusCents?: number;
  td1FederalCents?: number;
  td1ProvincialCents?: number;
  cppExempt?: boolean;
  eiExempt?: boolean;
  addons?: PayAddon[];
  /** RRSP deducted at source. Reduces taxable income. Not used by the simple pay day. */
  rrspCents?: number;
  /**
   * Extra tax the employee asked to have taken off each cheque.
   * Applied only when extraTaxApproved is true.
   * cra = TD1 additional tax. revenu_quebec = TP-1015.3-V additional source deduction.
   */
  extraTaxCents?: number;
  extraTaxAuthority?: "cra" | "revenu_quebec";
  extraTaxApproved?: boolean;
  /** Pay date (YYYY-MM-DD). Picks the CRA table edition. */
  payDate?: string;
  /** Ontario TD1ON dependants for the tax reduction. */
  ontarioDependants?: number;
};

export type MoneyLine = {
  code: string;
  cents: number;
  verified: boolean;
  note: string;
  /** Table edition this line came from, e.g. "CRA T4127 123rd edition (July 1, 2026)". */
  edition?: string;
  asOf?: string;
  source?: string;
};

export type PayEstimate = {
  label: string;
  province: string;
  periods: number;
  cashGrossCents: number;
  vacationCents: number;
  /** Bonus inside cashGrossCents. */
  bonusCents: number;
  /** Tax on the bonus (federal + provincial), already inside the tax totals. */
  bonusTaxCents: number;
  taxableBenefitCents: number;
  nontaxCashCents: number;
  pensionableCents: number;
  insurableCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employeeEiCents: number;
  employerEiCents: number;
  employeeQppCents: number;
  employeeQpp2Cents: number;
  employerQppCents: number;
  employerQpp2Cents: number;
  employeeQpipCents: number;
  employerQpipCents: number;
  federalTaxCents: number;
  provincialTaxCents: number | null;
  provincialVerified: boolean;
  /** Approved extra taken off this cheque. Not part of the formula tax. */
  extraTaxCents: number;
  extraTaxAuthority: "cra" | "revenu_quebec" | null;
  netCents: number;
  employerCostCents: number;
  governmentCents: number;
  lines: MoneyLine[];
  unverified: string[];
  /** Edition used for this pay, or null when no table covers the pay date. */
  edition: string | null;
  asOf: string | null;
  payDate: string;
  /**
   * Set when KidEase cannot work this pay out in full (no table for the date,
   * unknown province, or a pay type the engine does not support yet).
   * Every money field is then zero and the screen must not offer Approve.
   */
  blocked: string | null;
};

const ZERO_YTD: PayYtd = {
  pensionableCents: 0,
  cppOrQppCents: 0,
  cpp2Cents: 0,
  insurableCents: 0,
  eiCents: 0,
  qpipInsurableCents: 0,
  qpipCents: 0,
};

/** How each add-on hits pay. Unverified items follow the centre's flag and say so. */
export function classifyAddon(addon: PayAddon): {
  cashCents: number;
  benefitCents: number;
  nontaxCashCents: number;
  pensionable: boolean;
  insurable: boolean;
  verified: boolean;
  note: string;
} {
  const amount = Math.max(0, Math.round(addon.amountCents));
  const taxable = addon.taxable !== false;
  switch (addon.kind) {
    case "bonus":
    case "overtime":
    case "stat":
    case "vacation_taken":
    case "sick_pay":
      return {
        cashCents: amount,
        benefitCents: 0,
        nontaxCashCents: 0,
        pensionable: true,
        insurable: true,
        verified: true,
        note: "This is pay. Tax, CPP or QPP, and EI apply.",
      };
    case "reimbursement":
      if (taxable) {
        return {
          cashCents: amount,
          benefitCents: 0,
          nontaxCashCents: 0,
          pensionable: true,
          insurable: true,
          verified: false,
          note: "You marked this repayment as taxable. A normal work expense with a receipt is usually not.",
        };
      }
      return {
        cashCents: 0,
        benefitCents: 0,
        nontaxCashCents: amount,
        pensionable: false,
        insurable: false,
        verified: true,
        note: "A repayment of a work cost, with a receipt, is not pay. CRA guide T4130.",
      };
    case "training":
      return {
        cashCents: 0,
        benefitCents: taxable ? amount : 0,
        nontaxCashCents: taxable ? 0 : amount,
        pensionable: taxable,
        insurable: taxable,
        verified: false,
        note: "Training that mainly helps the centre is usually not pay. We did not verify this course. CRA guide T4130.",
      };
    case "childcare_discount":
      return {
        cashCents: 0,
        benefitCents: taxable ? amount : 0,
        nontaxCashCents: 0,
        pensionable: taxable,
        insurable: taxable,
        verified: false,
        note: "A staff childcare discount may be a taxable benefit. This build does not decide that. You chose the flag.",
      };
    case "advance":
      return {
        cashCents: 0,
        benefitCents: 0,
        nontaxCashCents: amount,
        pensionable: false,
        insurable: false,
        verified: false,
        note: "An advance is treated as a loan, not pay. Tax applies when the wages are earned. Confirm with your partner.",
      };
    case "advance_repay":
      return {
        cashCents: 0,
        benefitCents: 0,
        nontaxCashCents: -amount,
        pensionable: false,
        insurable: false,
        verified: false,
        note: "This repayment comes off the cash the person receives. It is not a tax deduction.",
      };
    case "tip":
      if (addon.tipControl === "controlled") {
        return {
          cashCents: amount,
          benefitCents: 0,
          nontaxCashCents: 0,
          pensionable: true,
          insurable: true,
          verified: false,
          note: "Controlled tips are usually pay for tax, CPP, and EI. Confirm the tip type with your partner.",
        };
      }
      return {
        cashCents: amount,
        benefitCents: 0,
        nontaxCashCents: 0,
        pensionable: false,
        insurable: false,
        verified: false,
        note: "Direct tips are the person's income, but the centre may not deduct CPP and EI. This split was not verified.",
      };
    case "gift":
      return {
        cashCents: taxable ? amount : 0,
        benefitCents: 0,
        nontaxCashCents: taxable ? 0 : 0,
        pensionable: taxable,
        insurable: taxable,
        verified: false,
        note: "Cash gifts are usually taxable. The non-cash gift limit was not re-checked for 2026.",
      };
    default:
      return {
        cashCents: 0,
        benefitCents: 0,
        nontaxCashCents: 0,
        pensionable: false,
        insurable: false,
        verified: false,
        note: "Unknown extra. It was left out.",
      };
  }
}

export function estimatePay(input: PayInput): PayEstimate {
  const province = input.province.toUpperCase();
  const quebec = province === "QC";
  const periods = PERIODS[input.frequency] ?? 26;
  const ytd = { ...ZERO_YTD, ...input.ytd };
  const unverified: string[] = [];
  const lines: MoneyLine[] = [];

  const vacationCents =
    input.vacationMode === "payout" ? Math.round((Math.max(0, input.regularGrossCents) * input.vacationBps) / 10_000) : 0;

  const cardBonus = Math.max(0, Math.round(input.bonusCents ?? 0));
  let bonus = cardBonus;
  let cash = Math.max(0, input.regularGrossCents) + vacationCents + cardBonus;
  let benefit = 0;
  let nontax = 0;
  let pensionableCash = cash;
  let insurableCash = cash;
  if (cardBonus > 0) {
    lines.push({ code: "bonus", cents: cardBonus, verified: true, note: "Bonus. Tax uses CRA's bonus method. CPP or QPP and EI apply as normal pay." });
  }

  for (const addon of input.addons ?? []) {
    const row = classifyAddon(addon);
    if (!row.verified) unverified.push(row.note);
    if (addon.kind === "bonus") bonus += row.cashCents;
    cash += row.cashCents;
    benefit += row.benefitCents;
    nontax += row.nontaxCashCents;
    if (row.pensionable) pensionableCash += row.cashCents + row.benefitCents;
    if (row.insurable) insurableCash += row.cashCents + row.benefitCents;
    lines.push({
      code: addon.kind,
      cents: row.cashCents + row.benefitCents + row.nontaxCashCents,
      verified: row.verified,
      note: row.note,
    });
  }

  const pensionable = Math.max(0, pensionableCash);
  const insurable = Math.max(0, insurableCash);
  const payDate = input.payDate ?? DEFAULT_PAY_DATE;
  const rrsp = Math.max(0, input.rrspCents ?? 0);

  const engine = isProvinceCode(province)
    ? calculateDeductions({
        province,
        frequency: (input.frequency in PERIODS ? input.frequency : "biweekly") as Frequency,
        payDate,
        taxableCents: Math.max(0, cash + benefit - bonus),
        bonusCents: bonus,
        ytdBonusCents: Math.max(0, input.ytdBonusCents ?? 0),
        pensionableCents: pensionable,
        insurableCents: insurable,
        rrspCents: rrsp,
        ytd: {
          pensionableCents: ytd.pensionableCents,
          cppCents: ytd.cppOrQppCents,
          cpp2Cents: ytd.cpp2Cents,
          eiCents: ytd.eiCents,
          qpipCents: ytd.qpipCents,
        },
        td1FederalCents: input.td1FederalCents ?? null,
        td1ProvincialCents: input.td1ProvincialCents ?? null,
        ontarioDependants: input.ontarioDependants,
        cppExempt: input.cppExempt === true,
        eiExempt: input.eiExempt === true,
      })
    : null;

  if (!engine || !engine.ok) {
    const blocked = engine && !engine.ok ? engine.message : "This province code is not known. KidEase cannot work out this pay.";
    unverified.push(blocked);
    return {
      label: ESTIMATE_LABEL,
      province,
      periods,
      cashGrossCents: cash,
      vacationCents,
      bonusCents: bonus,
      bonusTaxCents: 0,
      taxableBenefitCents: benefit,
      nontaxCashCents: nontax,
      pensionableCents: pensionable,
      insurableCents: insurable,
      employeeCppCents: 0,
      employeeCpp2Cents: 0,
      employerCppCents: 0,
      employerCpp2Cents: 0,
      employeeEiCents: 0,
      employerEiCents: 0,
      employeeQppCents: 0,
      employeeQpp2Cents: 0,
      employerQppCents: 0,
      employerQpp2Cents: 0,
      employeeQpipCents: 0,
      employerQpipCents: 0,
      federalTaxCents: 0,
      provincialTaxCents: null,
      provincialVerified: false,
      extraTaxCents: 0,
      extraTaxAuthority: null,
      netCents: 0,
      employerCostCents: 0,
      governmentCents: 0,
      lines,
      unverified,
      edition: null,
      asOf: null,
      payDate,
      blocked,
    };
  }

  for (const note of engine.notes) unverified.push(note);
  const employeePension = engine.cppCents;
  const employeeSecond = engine.cpp2Cents;
  const employeeEi = engine.eiCents;
  const employeeQpip = engine.qpipCents;
  const employerEi = engine.employerEiCents;
  const employerQpip = engine.employerQpipCents;
  let federalTax = engine.federalTaxCents;
  let provincialTax: number | null = engine.provincialTaxCents;
  const provincialLine = engine.lines.find((line) => line.code === "provincial_tax");
  const provincialVerified = provincialTax != null && provincialLine?.verified === true;
  if (provincialTax != null && !provincialVerified) {
    unverified.push("Quebec tax: check this line in WebRAS before you approve.");
  }

  const requestedExtra = Math.max(0, Math.round(input.extraTaxCents ?? 0));
  const extraApproved = input.extraTaxApproved === true && requestedExtra > 0;
  const extraAuthority = extraApproved ? (input.extraTaxAuthority === "revenu_quebec" ? "revenu_quebec" : "cra") : null;
  const extraTaxCents = extraApproved ? requestedExtra : 0;
  if (extraTaxCents > 0 && extraAuthority === "revenu_quebec") {
    provincialTax = (provincialTax ?? 0) + extraTaxCents;
  } else if (extraTaxCents > 0) {
    federalTax += extraTaxCents;
  }

  for (const line of engine.lines) lines.push(engineLine(line));

  const employeeDeductions = employeePension + employeeSecond + employeeEi + employeeQpip + federalTax + (provincialTax ?? 0);
  const net = cash + nontax - employeeDeductions - rrsp;
  const employerPension = engine.employerCppCents;
  const employerSecond = engine.employerCpp2Cents;
  const government =
    employeePension +
    employerPension +
    employeeSecond +
    employerSecond +
    employeeEi +
    employerEi +
    employeeQpip +
    employerQpip +
    federalTax +
    (provincialTax ?? 0);

  return {
    label: ESTIMATE_LABEL,
    province,
    periods,
    cashGrossCents: cash,
    vacationCents,
    bonusCents: bonus,
    bonusTaxCents: engine.bonusFederalTaxCents + engine.bonusProvincialTaxCents,
    taxableBenefitCents: benefit,
    nontaxCashCents: nontax,
    pensionableCents: pensionable,
    insurableCents: insurable,
    employeeCppCents: quebec ? 0 : employeePension,
    employeeCpp2Cents: quebec ? 0 : employeeSecond,
    employerCppCents: quebec ? 0 : employerPension,
    employerCpp2Cents: quebec ? 0 : employerSecond,
    employeeEiCents: employeeEi,
    employerEiCents: employerEi,
    employeeQppCents: quebec ? employeePension : 0,
    employeeQpp2Cents: quebec ? employeeSecond : 0,
    employerQppCents: quebec ? employerPension : 0,
    employerQpp2Cents: quebec ? employerSecond : 0,
    employeeQpipCents: employeeQpip,
    employerQpipCents: employerQpip,
    federalTaxCents: federalTax,
    provincialTaxCents: provincialTax,
    provincialVerified,
    extraTaxCents,
    extraTaxAuthority: extraAuthority,
    netCents: net,
    employerCostCents: cash + nontax + employerPension + employerSecond + employerEi + employerQpip,
    governmentCents: government,
    lines,
    unverified,
    edition: engine.edition.label,
    asOf: engine.edition.asOf,
    payDate,
    blocked: null,
  };
}

const LINE_NOTES: Record<EngineLine["code"], string> = {
  cpp: "CPP taken from pay.",
  cpp2: "Second CPP (CPP2) taken from pay above the first yearly limit.",
  qpp: "QPP taken from pay.",
  qpp2: "Second QPP (QPP2) taken from pay above the first yearly limit.",
  ei: "EI taken from pay.",
  qpip: "QPIP (Quebec parental insurance) taken from pay.",
  federal_tax: "Federal income tax taken from pay.",
  provincial_tax: "Provincial income tax taken from pay.",
  employer_cpp: "The centre pays the same CPP.",
  employer_cpp2: "The centre pays the same CPP2.",
  employer_qpp: "The centre pays the same QPP.",
  employer_qpp2: "The centre pays the same QPP2.",
  employer_ei: "The centre pays 1.4 times the EI.",
  employer_qpip: "The centre's QPIP share.",
};

function engineLine(line: EngineLine): MoneyLine {
  return {
    code: line.code,
    cents: line.cents,
    verified: line.verified,
    note: LINE_NOTES[line.code],
    edition: line.edition,
    asOf: line.asOf,
    source: line.source,
  };
}

export function salesTaxOnExtra(province: string, taxableCents: number, taxable: boolean): {
  cents: number;
  verified: boolean;
  note: string;
} {
  if (!taxable || taxableCents <= 0) {
    return {
      cents: 0,
      verified: true,
      note: "Child care is usually free of GST and HST. CRA memorandum 21-1.",
    };
  }
  const code = province.toUpperCase();
  if (code === "NS") {
    return { cents: 0, verified: false, note: "Nova Scotia sales tax was not verified, so it is not estimated." };
  }
  if (code === "QC") {
    const gst = cents(roundDollars((taxableCents / 100) * 0.05));
    return {
      cents: gst,
      verified: false,
      note: "GST at 5% is estimated. Quebec sales tax (QST) was not verified, so it is not added.",
    };
  }
  const hst = { ON: 0.13, NB: 0.15, NL: 0.15, PE: 0.15 } as Record<string, number>;
  const rate = hst[code] ?? 0.05;
  return {
    cents: cents(roundDollars((taxableCents / 100) * rate)),
    verified: true,
    note: code in hst ? "HST on this extra only. The child care fee stays exempt." : "GST at 5% on this extra only. Provincial sales tax was not added.",
  };
}

export { PROVINCIAL_TAX_READY };
