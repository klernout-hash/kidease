/**
 * An approved pay stub, as it is saved when the owner approves a pay period.
 * Exports, year-end slips, and remittance totals are all built from these rows,
 * so they always match what people were actually paid.
 */

import type { PayCard } from "./pay-card.ts";
import type { Province } from "./tables.ts";

export type ApprovedStub = {
  id: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  personId: string;
  name: string;
  province: Province;
  payType: "hourly" | "salary" | "contractor";
  regularMinutes: number;
  overtimeMinutes: number;
  grossCents: number;
  vacationCents: number;
  taxableBenefitCents: number;
  nontaxCents: number;
  pensionableCents: number;
  insurableCents: number;
  cppCents: number;
  cpp2Cents: number;
  qppCents: number;
  qpp2Cents: number;
  eiCents: number;
  qpipCents: number;
  federalTaxCents: number;
  provincialTaxCents: number;
  netCents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employerQppCents: number;
  employerQpp2Cents: number;
  employerEiCents: number;
  employerQpipCents: number;
  /** Payroll health tax share, Quebec CNT, WCB. Estimates. */
  employerOtherCents: number;
  contractorFeeCents: number;
  salesTaxCents: number;
  correctionCents: number;
  edition: string | null;
  asOf: string | null;
};

export function stubFromCard(input: {
  id: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  province: Province;
  card: PayCard;
  employerOtherCents?: number;
}): ApprovedStub {
  const card = input.card;
  const pay = card.employee;
  const base = {
    id: input.id,
    periodId: input.periodId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payDate: input.payDate,
    personId: card.personId,
    name: card.name,
    province: input.province,
    payType: card.payType,
    regularMinutes: card.regularMinutes,
    overtimeMinutes: card.overtimeMinutes,
    correctionCents: card.correctionCents,
    employerOtherCents: Math.max(0, Math.round(input.employerOtherCents ?? 0)),
  };
  if (!pay) {
    return {
      ...base,
      grossCents: 0,
      vacationCents: 0,
      taxableBenefitCents: 0,
      nontaxCents: 0,
      pensionableCents: 0,
      insurableCents: 0,
      cppCents: 0,
      cpp2Cents: 0,
      qppCents: 0,
      qpp2Cents: 0,
      eiCents: 0,
      qpipCents: 0,
      federalTaxCents: 0,
      provincialTaxCents: 0,
      netCents: card.netCents,
      employerCppCents: 0,
      employerCpp2Cents: 0,
      employerQppCents: 0,
      employerQpp2Cents: 0,
      employerEiCents: 0,
      employerQpipCents: 0,
      contractorFeeCents: card.contractor?.feeCents ?? 0,
      salesTaxCents: card.contractor?.salesTaxCents ?? 0,
      edition: null,
      asOf: null,
    };
  }
  return {
    ...base,
    grossCents: pay.cashGrossCents,
    vacationCents: pay.vacationCents,
    taxableBenefitCents: pay.taxableBenefitCents,
    nontaxCents: pay.nontaxCashCents,
    pensionableCents: pay.pensionableCents,
    insurableCents: pay.insurableCents,
    cppCents: pay.employeeCppCents,
    cpp2Cents: pay.employeeCpp2Cents,
    qppCents: pay.employeeQppCents,
    qpp2Cents: pay.employeeQpp2Cents,
    eiCents: pay.employeeEiCents,
    qpipCents: pay.employeeQpipCents,
    federalTaxCents: pay.federalTaxCents,
    provincialTaxCents: pay.provincialTaxCents ?? 0,
    netCents: pay.netCents,
    employerCppCents: pay.employerCppCents,
    employerCpp2Cents: pay.employerCpp2Cents,
    employerQppCents: pay.employerQppCents,
    employerQpp2Cents: pay.employerQpp2Cents,
    employerEiCents: pay.employerEiCents,
    employerQpipCents: pay.employerQpipCents,
    contractorFeeCents: 0,
    salesTaxCents: 0,
    edition: pay.edition,
    asOf: pay.asOf,
  };
}

/** Parse a saved stub row from JSON. Unknown fields are dropped and numbers are forced to integers. */
export function parseStub(value: unknown): ApprovedStub | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  const int = (key: string) => (Number.isFinite(Number(row[key])) ? Math.round(Number(row[key])) : 0);
  if (!text("id") || !text("personId")) return null;
  const payType = text("payType");
  return {
    id: text("id"),
    periodId: text("periodId"),
    periodStart: text("periodStart"),
    periodEnd: text("periodEnd"),
    payDate: text("payDate"),
    personId: text("personId"),
    name: text("name"),
    province: text("province") as Province,
    payType: payType === "salary" || payType === "contractor" ? payType : "hourly",
    regularMinutes: int("regularMinutes"),
    overtimeMinutes: int("overtimeMinutes"),
    grossCents: int("grossCents"),
    vacationCents: int("vacationCents"),
    taxableBenefitCents: int("taxableBenefitCents"),
    nontaxCents: int("nontaxCents"),
    pensionableCents: int("pensionableCents"),
    insurableCents: int("insurableCents"),
    cppCents: int("cppCents"),
    cpp2Cents: int("cpp2Cents"),
    qppCents: int("qppCents"),
    qpp2Cents: int("qpp2Cents"),
    eiCents: int("eiCents"),
    qpipCents: int("qpipCents"),
    federalTaxCents: int("federalTaxCents"),
    provincialTaxCents: int("provincialTaxCents"),
    netCents: int("netCents"),
    employerCppCents: int("employerCppCents"),
    employerCpp2Cents: int("employerCpp2Cents"),
    employerQppCents: int("employerQppCents"),
    employerQpp2Cents: int("employerQpp2Cents"),
    employerEiCents: int("employerEiCents"),
    employerQpipCents: int("employerQpipCents"),
    employerOtherCents: int("employerOtherCents"),
    contractorFeeCents: int("contractorFeeCents"),
    salesTaxCents: int("salesTaxCents"),
    correctionCents: int("correctionCents"),
    edition: text("edition") || null,
    asOf: text("asOf") || null,
  };
}
