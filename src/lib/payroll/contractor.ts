/**
 * Contractors: an agreed flat or base amount, no source deductions.
 * If the contractor is registered for GST/HST, their invoice adds it.
 * At year end the fees go on a T4A, box 048 (fees for services).
 */

import type { Province } from "./tables.ts";

export const CONTRACTOR_AS_OF = "2026-11-22";

/** GST and HST rates. Nova Scotia and Quebec's QST were not re-checked, so they are not added. */
const SALES_TAX: Partial<Record<Province, { rate: number; kind: "GST" | "HST"; verified: boolean }>> = {
  AB: { rate: 0.05, kind: "GST", verified: true },
  BC: { rate: 0.05, kind: "GST", verified: true },
  MB: { rate: 0.05, kind: "GST", verified: true },
  NT: { rate: 0.05, kind: "GST", verified: true },
  NU: { rate: 0.05, kind: "GST", verified: true },
  SK: { rate: 0.05, kind: "GST", verified: true },
  YT: { rate: 0.05, kind: "GST", verified: true },
  QC: { rate: 0.05, kind: "GST", verified: true },
  ON: { rate: 0.13, kind: "HST", verified: true },
  NB: { rate: 0.15, kind: "HST", verified: true },
  NL: { rate: 0.15, kind: "HST", verified: true },
  PE: { rate: 0.15, kind: "HST", verified: true },
};

export const GST_HST_SOURCE =
  "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html";

export type ContractorTerms = {
  /** flat: the same amount each pay. base: an agreed base plus extra amounts this pay. */
  basis: "flat" | "base";
  amountCents: number;
  extraCents?: number;
  gstRegistered: boolean;
  gstNumber?: string | null;
  province: Province;
};

export type ContractorPay = {
  feeCents: number;
  salesTaxCents: number;
  salesTaxKind: "GST" | "HST" | null;
  salesTaxVerified: boolean;
  totalCents: number;
  /** Always zero. Contractors pay their own tax, CPP, and EI. */
  deductionsCents: 0;
  notes: string[];
};

/** A GST/HST number is 9 digits, then RT, then 4 digits. */
export function validGstNumber(value: string | null | undefined): boolean {
  return /^\d{9}\s?RT\s?\d{4}$/i.test(String(value ?? "").trim());
}

export function contractorPay(terms: ContractorTerms): ContractorPay {
  const notes: string[] = [];
  const fee = Math.max(0, Math.round(terms.amountCents)) + (terms.basis === "base" ? Math.max(0, Math.round(terms.extraCents ?? 0)) : 0);
  let salesTax = 0;
  let kind: "GST" | "HST" | null = null;
  let verified = true;
  if (terms.gstRegistered) {
    const rule = SALES_TAX[terms.province];
    if (!rule) {
      verified = false;
      notes.push("GST/HST for this province was not re-checked. Use the amount on the contractor's invoice.");
    } else {
      salesTax = Math.round(fee * rule.rate);
      kind = rule.kind;
      if (terms.province === "QC") notes.push("Quebec sales tax (QST) is not added. Use the amount on the contractor's invoice.");
    }
    if (!validGstNumber(terms.gstNumber)) notes.push("Ask the contractor for their GST/HST number. It looks like 123456789 RT 0001.");
  }
  notes.push("No tax, CPP, or EI is taken off. The contractor pays their own.");
  return { feeCents: fee, salesTaxCents: salesTax, salesTaxKind: kind, salesTaxVerified: verified, totalCents: fee + salesTax, deductionsCents: 0, notes };
}

/**
 * T4A box 048 is fees for services. KidEase puts the fee without GST/HST.
 * Whether GST/HST belongs in box 048 was not checked in RC4157 (verified: false).
 */
export const T4A_GST_IN_BOX_048_VERIFIED = false;
export const T4A_SOURCE = "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/rc4157-filing-t4a-slip-summary.html";
