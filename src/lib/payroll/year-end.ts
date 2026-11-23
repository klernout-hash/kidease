/**
 * Year-end slip boxes from approved stubs: T4 (employees), T4A box 048
 * (contractors), and RL-1 (Quebec employees).
 * Box meanings: CRA/PSPC sample T4 and Relevé 1 page, read 2026-11-22.
 * Filing the CRA XML and Revenu Québec files is a later step. This builds the numbers and a CSV.
 */

import type { ApprovedStub } from "./stubs.ts";

export const SLIP_SOURCES = {
  t4: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/rc4120-employers-guide-filing-t4-slip-summary.html",
  t4a: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/rc4157-filing-t4a-slip-summary.html",
  rl1: "https://www.revenuquebec.ca/en/online-services/forms-and-publications/current-details/rl-1-g-v/",
  boxes: "https://www.canada.ca/en/public-services-procurement/services/pay-pension/pay-administration/access-update-pay-details/check-your-pay-stub/sample-t4-releve-1-tax-slips.html",
  asOf: "2026-11-22",
} as const;

/** RL-1 box B: whether QPP2 belongs in box B was not confirmed on a Revenu Québec page. */
export const RL1_BOX_B_INCLUDES_QPP2_VERIFIED = false;

export type T4Slip = {
  personId: string;
  name: string;
  year: number;
  /** Box 10: province of employment. */
  box10: string;
  box14: number;
  box16: number;
  box16A: number;
  box17: number;
  box17A: number;
  box18: number;
  box22: number;
  box24: number;
  box26: number;
  box55: number;
  box56: number;
};

export type T4ASlip = { personId: string; name: string; year: number; box048: number; box022: number };

export type Rl1Slip = { personId: string; name: string; year: number; A: number; B: number; C: number; E: number; G: number; H: number; I: number };

function yearOf(stub: ApprovedStub): number {
  return Number(stub.payDate.slice(0, 4));
}

function group(stubs: readonly ApprovedStub[], year: number, pick: (stub: ApprovedStub) => boolean): Map<string, ApprovedStub[]> {
  const map = new Map<string, ApprovedStub[]>();
  for (const stub of stubs) {
    if (yearOf(stub) !== year || !pick(stub)) continue;
    const list = map.get(stub.personId) ?? [];
    list.push(stub);
    map.set(stub.personId, list);
  }
  return map;
}

const sum = (rows: readonly ApprovedStub[], pick: (row: ApprovedStub) => number) => rows.reduce((total, row) => total + pick(row), 0);

export function t4Slips(stubs: readonly ApprovedStub[], year: number): T4Slip[] {
  const out: T4Slip[] = [];
  for (const rows of group(stubs, year, (stub) => stub.payType !== "contractor").values()) {
    const last = rows[rows.length - 1];
    const quebec = last.province === "QC";
    out.push({
      personId: last.personId,
      name: last.name,
      year,
      box10: last.province,
      box14: sum(rows, (row) => row.grossCents + row.taxableBenefitCents),
      box16: sum(rows, (row) => row.cppCents),
      box16A: sum(rows, (row) => row.cpp2Cents),
      box17: sum(rows, (row) => row.qppCents),
      box17A: sum(rows, (row) => row.qpp2Cents),
      box18: sum(rows, (row) => row.eiCents),
      // Box 22 is federal plus provincial tax, but not Quebec tax.
      box22: sum(rows, (row) => row.federalTaxCents + (quebec ? 0 : row.provincialTaxCents)),
      box24: sum(rows, (row) => row.insurableCents),
      box26: sum(rows, (row) => row.pensionableCents),
      box55: sum(rows, (row) => row.qpipCents),
      box56: quebec ? sum(rows, (row) => row.insurableCents) : 0,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function t4aSlips(stubs: readonly ApprovedStub[], year: number): T4ASlip[] {
  const out: T4ASlip[] = [];
  for (const rows of group(stubs, year, (stub) => stub.payType === "contractor").values()) {
    const last = rows[rows.length - 1];
    out.push({ personId: last.personId, name: last.name, year, box048: sum(rows, (row) => row.contractorFeeCents), box022: 0 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function rl1Slips(stubs: readonly ApprovedStub[], year: number): Rl1Slip[] {
  const out: Rl1Slip[] = [];
  for (const rows of group(stubs, year, (stub) => stub.payType !== "contractor" && stub.province === "QC").values()) {
    const last = rows[rows.length - 1];
    out.push({
      personId: last.personId,
      name: last.name,
      year,
      A: sum(rows, (row) => row.grossCents + row.taxableBenefitCents),
      B: sum(rows, (row) => row.qppCents + row.qpp2Cents),
      C: sum(rows, (row) => row.eiCents),
      E: sum(rows, (row) => row.provincialTaxCents),
      G: sum(rows, (row) => row.pensionableCents),
      H: sum(rows, (row) => row.qpipCents),
      I: sum(rows, (row) => row.insurableCents),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
