/**
 * Pay-day estimate.
 *
 * Follows the step-by-step method printed in CRA T4032 (January 2026),
 * which uses the same 2026 rates as T4127. CRA tells payroll software to
 * use T4127 itself. This result can differ from PDOC by rounding.
 * It is an estimate. The payroll partner does the final math and the remittance.
 */

import { cents, roundDollars } from "./money.ts";
import {
  CPP_2026,
  EI_2026,
  FEDERAL_BRACKETS_2026,
  FEDERAL_TAX_2026,
  ONTARIO_TAX_2026,
  PERIODS,
  PROVINCIAL_BRACKETS_2026,
  PROVINCIAL_TAX_READY,
  QPIP_2026,
  QPP_2026,
  type TaxBracket,
} from "./rates-2026.ts";

export const ESTIMATE_LABEL = "Estimate. Your payroll partner does the final math and sends the money.";

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
};

export type MoneyLine = {
  code: string;
  cents: number;
  verified: boolean;
  note: string;
};

export type PayEstimate = {
  label: string;
  province: string;
  periods: number;
  cashGrossCents: number;
  vacationCents: number;
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

function bracketTax(income: number, table: readonly TaxBracket[]): number {
  const row = table.find((item) => income <= item.upTo) ?? table[table.length - 1];
  return roundDollars(roundDollars(income * row.rate) - row.k);
}

function periodContribution(pensionableDollars: number, periods: number, rate: number, exemptionDollars: number): number {
  const base = Math.max(0, pensionableDollars - exemptionDollars / periods);
  return roundDollars(base * rate);
}

function capPeriod(calculated: number, ytdCents: number, maxCents: number): number {
  const room = Math.max(0, roundDollars(maxCents / 100 - ytdCents / 100));
  return roundDollars(Math.min(calculated, room));
}

function ontarioHealth(income: number): number {
  if (income <= 20_000) return 0;
  if (income <= 36_000) return Math.min(300, roundDollars(0.06 * (income - 20_000)));
  if (income <= 48_000) return Math.min(450, roundDollars(300 + 0.06 * (income - 36_000)));
  if (income <= 72_000) return Math.min(600, roundDollars(450 + 0.25 * (income - 48_000)));
  if (income <= 200_000) return Math.min(750, roundDollars(600 + 0.25 * (income - 72_000)));
  return Math.min(900, roundDollars(750 + 0.25 * (income - 200_000)));
}

function ontarioSurtax(basic: number): number {
  if (basic <= ONTARIO_TAX_2026.surtaxFirst) return 0;
  const first = roundDollars(0.2 * (basic - ONTARIO_TAX_2026.surtaxFirst));
  if (basic <= ONTARIO_TAX_2026.surtaxSecond) return first;
  return roundDollars(first + 0.36 * (basic - ONTARIO_TAX_2026.surtaxSecond));
}

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

  let cash = Math.max(0, input.regularGrossCents) + vacationCents;
  let benefit = 0;
  let nontax = 0;
  let pensionableCash = cash;
  let insurableCash = cash;

  for (const addon of input.addons ?? []) {
    const row = classifyAddon(addon);
    if (!row.verified) unverified.push(row.note);
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
  const pensionPlan = quebec ? QPP_2026 : CPP_2026;
  const exemptPension = input.cppExempt === true;
  const exemptEi = input.eiExempt === true;

  let employeePension = 0;
  let employeeSecond = 0;
  if (!exemptPension && pensionable > 0) {
    const roomPensionable = Math.max(0, pensionPlan.ympeCents - ytd.pensionableCents);
    const thisBase = Math.min(pensionable, roomPensionable);
    const calculated = periodContribution(
      thisBase / 100,
      periods,
      pensionPlan.employeeRate,
      pensionPlan.basicExemptionCents / 100,
    );
    employeePension = cents(capPeriod(calculated, ytd.cppOrQppCents, pensionPlan.maxEmployeeCents));

    const before = ytd.pensionableCents;
    const after = before + pensionable;
    if (after > pensionPlan.ympeCents && before < pensionPlan.yampeCents) {
      const bandStart = Math.max(before, pensionPlan.ympeCents);
      const bandEnd = Math.min(after, pensionPlan.yampeCents);
      const band = Math.max(0, bandEnd - bandStart);
      const raw = roundDollars((band / 100) * pensionPlan.secondRate);
      employeeSecond = cents(capPeriod(raw, ytd.cpp2Cents, pensionPlan.maxSecondCents));
    }
  }

  const additionalRate = pensionPlan.firstAdditionalRate / pensionPlan.employeeRate;
  const additionalPortion = employeePension === 0 ? 0 : cents(roundDollars((employeePension / 100) * additionalRate));
  const basePortion = employeePension - additionalPortion;

  let employeeEi = 0;
  if (!exemptEi && insurable > 0) {
    const eiRate = quebec ? EI_2026.quebecEmployeeRate : EI_2026.employeeRate;
    const eiMax = quebec ? EI_2026.quebecMaxEmployeeCents : EI_2026.maxEmployeeCents;
    const room = Math.max(0, EI_2026.maxInsurableCents - ytd.insurableCents);
    const thisInsurable = Math.min(insurable, room);
    const raw = roundDollars((thisInsurable / 100) * eiRate);
    employeeEi = cents(capPeriod(raw, ytd.eiCents, eiMax));
  }

  let employeeQpip = 0;
  if (quebec && !exemptEi && insurable > 0) {
    const room = Math.max(0, QPIP_2026.maxInsurableCents - ytd.qpipInsurableCents);
    const thisInsurable = Math.min(insurable, room);
    const raw = roundDollars((thisInsurable / 100) * QPIP_2026.employeeRate);
    employeeQpip = cents(capPeriod(raw, ytd.qpipCents, QPIP_2026.maxEmployeeCents));
  }

  const employerEiRate = quebec ? EI_2026.quebecEmployerRate : EI_2026.employerRate;
  const employerEiMax = quebec ? EI_2026.quebecMaxEmployerCents : EI_2026.maxEmployerCents;
  const employerEiBase = exemptEi ? 0 : Math.min(insurable, Math.max(0, EI_2026.maxInsurableCents - ytd.insurableCents));
  const employerEi = cents(
    capPeriod(roundDollars((employerEiBase / 100) * employerEiRate), Math.round((ytd.eiCents * employerEiRate) / (quebec ? EI_2026.quebecEmployeeRate : EI_2026.employeeRate)), employerEiMax),
  );
  const employerQpip = quebec
    ? cents(
        capPeriod(
          roundDollars((Math.min(insurable, Math.max(0, QPIP_2026.maxInsurableCents - ytd.qpipInsurableCents)) / 100) * QPIP_2026.employerRate),
          Math.round((ytd.qpipCents * QPIP_2026.employerRate) / QPIP_2026.employeeRate),
          QPIP_2026.maxEmployerCents,
        ),
      )
    : 0;

  const rrsp = Math.max(0, input.rrspCents ?? 0);
  const deductionForTax = additionalPortion + employeeSecond + rrsp;
  const periodNetForTax = Math.max(0, cash + benefit - deductionForTax);
  const annualTaxable = roundDollars((periodNetForTax / 100) * periods);

  const annualBaseCredit = exemptPension
    ? 0
    : Math.min(pensionPlan.maxBaseCents / 100, roundDollars((basePortion / 100) * periods));
  const annualEiCredit = exemptEi
    ? 0
    : Math.min((quebec ? EI_2026.quebecMaxEmployeeCents : EI_2026.maxEmployeeCents) / 100, roundDollars((employeeEi / 100) * periods));
  const annualQpipCredit = quebec ? Math.min(QPIP_2026.maxEmployeeCents / 100, roundDollars((employeeQpip / 100) * periods)) : 0;
  const employmentForCea = roundDollars(((cash + benefit) / 100) * periods);
  const cea = Math.min(FEDERAL_TAX_2026.canadaEmploymentAmount, Math.max(0, employmentForCea));
  const td1 = (input.td1FederalCents ?? cents(FEDERAL_TAX_2026.maxBasicPersonal)) / 100;
  const federalCreditBase = roundDollars(td1 + annualBaseCredit + annualEiCredit + annualQpipCredit + cea);
  const federalTaxBeforeCredit = bracketTax(annualTaxable, FEDERAL_BRACKETS_2026);
  const federalCredit = roundDollars(federalCreditBase * FEDERAL_TAX_2026.lowestRate);
  const basicFederal = Math.max(0, roundDollars(federalTaxBeforeCredit - federalCredit));
  const abatement = quebec ? roundDollars(basicFederal * FEDERAL_TAX_2026.quebecAbatement) : 0;
  const annualFederal = Math.max(0, roundDollars(basicFederal - abatement));

  let annualProvincial: number | null = null;
  let provincialVerified = false;
  if (province === "ON") {
    provincialVerified = true;
    const claim = (input.td1ProvincialCents ?? cents(ONTARIO_TAX_2026.basicPersonal)) / 100;
    const provincialCreditBase = roundDollars(claim + annualBaseCredit + annualEiCredit);
    const basic = Math.max(
      0,
      roundDollars(bracketTax(annualTaxable, PROVINCIAL_BRACKETS_2026.ON) - roundDollars(provincialCreditBase * ONTARIO_TAX_2026.lowestRate)),
    );
    const surtax = ontarioSurtax(basic);
    const beforeHealth = roundDollars(basic + surtax);
    const health = ontarioHealth(annualTaxable);
    const reduction = Math.max(0, roundDollars(ONTARIO_TAX_2026.reductionBasic * 2 - beforeHealth));
    annualProvincial = Math.max(0, roundDollars(beforeHealth + health - reduction));
  } else if (province === "QC") {
    unverified.push("Quebec income tax follows Revenu Québec TP-1015.F. It is not estimated here.");
  } else if (PROVINCIAL_BRACKETS_2026[province]) {
    unverified.push(`Provincial tax for ${province} is not estimated. The brackets are published, but the personal amount and credits were not verified.`);
  } else {
    unverified.push("Provincial tax is not estimated for this place.");
  }

  const federalPart = cents(roundDollars(annualFederal / periods));
  const provincialPart = annualProvincial == null ? null : cents(roundDollars(annualProvincial / periods));
  const combined = cents(roundDollars((annualFederal + (annualProvincial ?? 0)) / periods));
  let federalTax = federalPart;
  let provincialTax: number | null =
    provincialPart == null ? null : provincialPart + (combined - (federalPart + provincialPart));

  const requestedExtra = Math.max(0, Math.round(input.extraTaxCents ?? 0));
  const extraApproved = input.extraTaxApproved === true && requestedExtra > 0;
  const extraAuthority = extraApproved ? (input.extraTaxAuthority === "revenu_quebec" ? "revenu_quebec" : "cra") : null;
  const extraTaxCents = extraApproved ? requestedExtra : 0;
  if (extraTaxCents > 0 && extraAuthority === "revenu_quebec") {
    provincialTax = (provincialTax ?? 0) + extraTaxCents;
  } else if (extraTaxCents > 0) {
    federalTax += extraTaxCents;
  }

  const employeeDeductions =
    employeePension +
    employeeSecond +
    employeeEi +
    employeeQpip +
    federalTax +
    (provincialTax ?? 0);
  const net = cash + nontax - employeeDeductions;
  const employerPension = exemptPension ? 0 : employeePension;
  const employerSecond = exemptPension ? 0 : employeeSecond;
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
