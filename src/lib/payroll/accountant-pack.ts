/**
 * The accountant pack: everything an accounting firm needs, from approved stubs.
 * - Pay register, deductions by type, employer costs, remittance summary by due
 *   date, year-to-date per person, and T4 / T4A / RL-1 totals, as CSV.
 * - The same in printable lines for the PDF helper.
 * - A payroll journal CSV in Xero's manual journal import layout.
 * - A read-only JSON shape for future API partners.
 *
 * KidEase never holds remittance money. The remittance summary tells the owner
 * what to send and when, paid from their own bank.
 */

import { craDueDate, type RemitterType } from "./remittance.ts";
import type { ApprovedStub } from "./stubs.ts";
import { rl1Slips, t4aSlips, t4Slips } from "./year-end.ts";

export const PACK_VERSION = "kidease-payroll-pack/1";

function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** CSV cell with formula-injection guard. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const sum = (rows: readonly ApprovedStub[], pick: (row: ApprovedStub) => number) => rows.reduce((total, row) => total + pick(row), 0);

export function payRegisterCsv(stubs: readonly ApprovedStub[]): string {
  const header = [
    "pay_date", "period_start", "period_end", "person", "province", "pay_type", "regular_hours", "overtime_hours",
    "gross", "vacation", "taxable_benefits", "non_taxable", "cpp", "cpp2", "qpp", "qpp2", "ei", "qpip",
    "federal_tax", "provincial_tax", "net", "contractor_fee", "contractor_gst_hst", "correction", "table_edition", "as_of",
  ];
  const rows = [...stubs]
    .sort((a, b) => a.payDate.localeCompare(b.payDate) || a.name.localeCompare(b.name))
    .map((s) => [
      s.payDate, s.periodStart, s.periodEnd, s.name, s.province, s.payType,
      (s.regularMinutes / 60).toFixed(2), (s.overtimeMinutes / 60).toFixed(2),
      money(s.grossCents), money(s.vacationCents), money(s.taxableBenefitCents), money(s.nontaxCents),
      money(s.cppCents), money(s.cpp2Cents), money(s.qppCents), money(s.qpp2Cents), money(s.eiCents), money(s.qpipCents),
      money(s.federalTaxCents), money(s.provincialTaxCents), money(s.netCents),
      money(s.contractorFeeCents), money(s.salesTaxCents), money(s.correctionCents), s.edition ?? "", s.asOf ?? "",
    ]);
  return toCsv([header, ...rows]);
}

export type DeductionTotals = Record<
  "cpp" | "cpp2" | "qpp" | "qpp2" | "ei" | "qpip" | "federal_tax" | "provincial_tax" | "quebec_tax",
  number
>;

export function deductionTotals(stubs: readonly ApprovedStub[]): DeductionTotals {
  return {
    cpp: sum(stubs, (s) => s.cppCents),
    cpp2: sum(stubs, (s) => s.cpp2Cents),
    qpp: sum(stubs, (s) => s.qppCents),
    qpp2: sum(stubs, (s) => s.qpp2Cents),
    ei: sum(stubs, (s) => s.eiCents),
    qpip: sum(stubs, (s) => s.qpipCents),
    federal_tax: sum(stubs, (s) => s.federalTaxCents),
    provincial_tax: sum(stubs, (s) => (s.province === "QC" ? 0 : s.provincialTaxCents)),
    quebec_tax: sum(stubs, (s) => (s.province === "QC" ? s.provincialTaxCents : 0)),
  };
}

export function deductionsCsv(stubs: readonly ApprovedStub[]): string {
  const totals = deductionTotals(stubs);
  return toCsv([["deduction", "employee_total"], ...Object.entries(totals).map(([code, cents]) => [code, money(cents)])]);
}

export function employerCostTotals(stubs: readonly ApprovedStub[]) {
  return {
    employer_cpp: sum(stubs, (s) => s.employerCppCents),
    employer_cpp2: sum(stubs, (s) => s.employerCpp2Cents),
    employer_qpp: sum(stubs, (s) => s.employerQppCents),
    employer_qpp2: sum(stubs, (s) => s.employerQpp2Cents),
    employer_ei: sum(stubs, (s) => s.employerEiCents),
    employer_qpip: sum(stubs, (s) => s.employerQpipCents),
    other_estimate: sum(stubs, (s) => s.employerOtherCents),
  };
}

export function employerCostsCsv(stubs: readonly ApprovedStub[]): string {
  return toCsv([["employer_cost", "total"], ...Object.entries(employerCostTotals(stubs)).map(([code, cents]) => [code, money(cents)])]);
}

export type RemittanceRow = {
  payee: "CRA" | "Revenu Québec";
  month: string;
  dueDate: string | null;
  dueVerified: boolean;
  parts: { code: string; cents: number }[];
  totalCents: number;
};

function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * What to send to whom, and by when, grouped by the month of the pay date.
 * CRA gets federal tax, CPP, CPP2, and EI (both shares). For Quebec staff,
 * Revenu Québec gets QPP, QPP2, QPIP, and Quebec tax; CRA still gets federal tax and EI.
 */
export function remittanceSummary(stubs: readonly ApprovedStub[], remitter: RemitterType): RemittanceRow[] {
  const months = new Map<string, ApprovedStub[]>();
  for (const stub of stubs) {
    const month = stub.payDate.slice(0, 7);
    const list = months.get(month) ?? [];
    list.push(stub);
    months.set(month, list);
  }
  const out: RemittanceRow[] = [];
  for (const [month, rows] of [...months.entries()].sort()) {
    const due = craDueDate(lastDay(month), remitter);
    const craParts = [
      { code: "federal_tax", cents: sum(rows, (s) => s.federalTaxCents) },
      { code: "provincial_tax", cents: sum(rows, (s) => (s.province === "QC" ? 0 : s.provincialTaxCents)) },
      { code: "cpp_both", cents: sum(rows, (s) => s.cppCents + s.employerCppCents) },
      { code: "cpp2_both", cents: sum(rows, (s) => s.cpp2Cents + s.employerCpp2Cents) },
      { code: "ei_both", cents: sum(rows, (s) => s.eiCents + s.employerEiCents) },
    ].filter((part) => part.cents !== 0);
    if (craParts.length) {
      out.push({ payee: "CRA", month, dueDate: due.date, dueVerified: due.verified, parts: craParts, totalCents: craParts.reduce((t, p) => t + p.cents, 0) });
    }
    const rqParts = [
      { code: "quebec_tax", cents: sum(rows, (s) => (s.province === "QC" ? s.provincialTaxCents : 0)) },
      { code: "qpp_both", cents: sum(rows, (s) => s.qppCents + s.employerQppCents) },
      { code: "qpp2_both", cents: sum(rows, (s) => s.qpp2Cents + s.employerQpp2Cents) },
      { code: "qpip_both", cents: sum(rows, (s) => s.qpipCents + s.employerQpipCents) },
    ].filter((part) => part.cents !== 0);
    if (rqParts.length) {
      // Revenu Québec's own due dates were not checked in this build. CRA's date is shown as a guide.
      out.push({ payee: "Revenu Québec", month, dueDate: due.date, dueVerified: false, parts: rqParts, totalCents: rqParts.reduce((t, p) => t + p.cents, 0) });
    }
  }
  return out;
}

export function remittanceCsv(rows: readonly RemittanceRow[]): string {
  const lines: (string | number)[][] = [["payee", "pay_month", "due_date", "due_date_checked", "part", "amount"]];
  for (const row of rows) {
    for (const part of row.parts) lines.push([row.payee, row.month, row.dueDate ?? "", row.dueVerified ? "yes" : "no", part.code, money(part.cents)]);
    lines.push([row.payee, row.month, row.dueDate ?? "", row.dueVerified ? "yes" : "no", "total", money(row.totalCents)]);
  }
  return toCsv(lines);
}

export function ytdCsv(stubs: readonly ApprovedStub[], year: number): string {
  const people = new Map<string, ApprovedStub[]>();
  for (const stub of stubs) {
    if (!stub.payDate.startsWith(String(year))) continue;
    const list = people.get(stub.personId) ?? [];
    list.push(stub);
    people.set(stub.personId, list);
  }
  const lines: (string | number)[][] = [["person", "pay_type", "gross", "cpp_or_qpp", "cpp2_or_qpp2", "ei", "qpip", "federal_tax", "provincial_tax", "net", "contractor_fee"]];
  for (const rows of people.values()) {
    const last = rows[rows.length - 1];
    lines.push([
      last.name, last.payType,
      money(sum(rows, (s) => s.grossCents)),
      money(sum(rows, (s) => s.cppCents + s.qppCents)),
      money(sum(rows, (s) => s.cpp2Cents + s.qpp2Cents)),
      money(sum(rows, (s) => s.eiCents)),
      money(sum(rows, (s) => s.qpipCents)),
      money(sum(rows, (s) => s.federalTaxCents)),
      money(sum(rows, (s) => s.provincialTaxCents)),
      money(sum(rows, (s) => s.netCents)),
      money(sum(rows, (s) => s.contractorFeeCents)),
    ]);
  }
  return toCsv(lines);
}

export function slipsCsv(stubs: readonly ApprovedStub[], year: number): string {
  const lines: (string | number)[][] = [["slip", "person", "box", "amount"]];
  for (const slip of t4Slips(stubs, year)) {
    for (const box of ["box14", "box16", "box16A", "box17", "box17A", "box18", "box22", "box24", "box26", "box55", "box56"] as const) {
      if (slip[box] !== 0) lines.push(["T4", slip.name, box.slice(3), money(slip[box])]);
    }
    lines.push(["T4", slip.name, "10", slip.box10]);
  }
  for (const slip of t4aSlips(stubs, year)) lines.push(["T4A", slip.name, "048", money(slip.box048)]);
  for (const slip of rl1Slips(stubs, year)) {
    for (const box of ["A", "B", "C", "E", "G", "H", "I"] as const) if (slip[box] !== 0) lines.push(["RL-1", slip.name, box, money(slip[box])]);
  }
  return toCsv(lines);
}

/** Default account codes. The accountant can change these before import. */
export const DEFAULT_ACCOUNTS = {
  wages: "6000",
  employerCosts: "6010",
  contractorFees: "6020",
  netPayable: "2150",
  craPayable: "2100",
  rqPayable: "2110",
  otherPayable: "2120",
} as const;

export type AccountMap = { [K in keyof typeof DEFAULT_ACCOUNTS]: string };

/**
 * Xero manual journal import CSV. Columns follow Xero's ManualJournal import
 * template: *Narration, *Date, Description, *AccountCode, *TaxRate, *Amount,
 * TrackingName1, TrackingOption1, TrackingName2, TrackingOption2.
 * Debits are positive and credits are negative. One journal per pay date.
 * The column list was not re-read from Xero's help page in this build
 * (XERO_TEMPLATE_VERIFIED). Confirm with Xero before the first import.
 */
export const XERO_TEMPLATE_VERIFIED = false;

export function xeroJournalCsv(stubs: readonly ApprovedStub[], accounts: AccountMap = DEFAULT_ACCOUNTS): string {
  const header = ["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2"];
  const lines: (string | number)[][] = [header];
  const dates = [...new Set(stubs.map((s) => s.payDate))].sort();
  for (const date of dates) {
    const rows = stubs.filter((s) => s.payDate === date);
    const narration = `Payroll ${date}`;
    const wages = sum(rows, (s) => s.grossCents + s.nontaxCents);
    const employer = sum(rows, (s) => s.employerCppCents + s.employerCpp2Cents + s.employerQppCents + s.employerQpp2Cents + s.employerEiCents + s.employerQpipCents + s.employerOtherCents);
    const contractor = sum(rows, (s) => s.contractorFeeCents + s.salesTaxCents);
    const cra = sum(rows, (s) => s.federalTaxCents + (s.province === "QC" ? 0 : s.provincialTaxCents) + s.cppCents + s.employerCppCents + s.cpp2Cents + s.employerCpp2Cents + s.eiCents + s.employerEiCents);
    const rq = sum(rows, (s) => (s.province === "QC" ? s.provincialTaxCents : 0) + s.qppCents + s.employerQppCents + s.qpp2Cents + s.employerQpp2Cents + s.qpipCents + s.employerQpipCents);
    const other = sum(rows, (s) => s.employerOtherCents);
    const net = sum(rows, (s) => (s.payType === "contractor" ? s.contractorFeeCents + s.salesTaxCents : s.netCents));
    const entries: [string, string, number][] = [
      ["Gross wages", accounts.wages, wages],
      ["Employer payroll costs", accounts.employerCosts, employer],
      ["Contractor fees", accounts.contractorFees, contractor],
      ["Net pay owed to staff and contractors", accounts.netPayable, -net],
      ["Owed to CRA", accounts.craPayable, -cra],
      ["Owed to Revenu Québec", accounts.rqPayable, -rq],
      ["Other payroll taxes (estimate)", accounts.otherPayable, -other],
    ];
    // RRSP or other cash differences go to net so the journal balances.
    const balance = entries.reduce((t, e) => t + e[2], 0);
    if (balance !== 0) entries.push(["Other payroll deductions", accounts.netPayable, -balance]);
    for (const [description, code, cents] of entries) {
      if (cents === 0) continue;
      lines.push([narration, date, description, code, "Tax Exempt", money(cents), "", "", "", ""]);
    }
  }
  return toCsv(lines);
}

/** Printable lines for the one-page PDF helper. */
export function packPdfLines(input: { centreName: string; from: string; to: string; stubs: readonly ApprovedStub[]; remitter: RemitterType; locale: "en" | "fr" }): string[] {
  const fr = input.locale === "fr";
  const totals = deductionTotals(input.stubs);
  const employer = employerCostTotals(input.stubs);
  const lines = [
    "KidEase",
    fr ? "Dossier pour le comptable" : "Accountant pack",
    `${input.centreName}`,
    `${fr ? "Période" : "Period"}: ${input.from} - ${input.to}`,
    `${fr ? "Talons" : "Pay stubs"}: ${input.stubs.length}`,
    `${fr ? "Brut" : "Gross"}: ${money(sum(input.stubs, (s) => s.grossCents))}`,
    `${fr ? "Net" : "Net"}: ${money(sum(input.stubs, (s) => s.netCents))}`,
    "",
    fr ? "Retenues" : "Deductions",
    ...Object.entries(totals).filter(([, c]) => c !== 0).map(([code, c]) => `  ${code}: ${money(c)}`),
    "",
    fr ? "Coûts de l'employeur" : "Employer costs",
    ...Object.entries(employer).filter(([, c]) => c !== 0).map(([code, c]) => `  ${code}: ${money(c)}`),
    "",
    fr ? "À envoyer, de votre propre banque" : "To send, from your own bank",
    ...remittanceSummary(input.stubs, input.remitter).map((row) => `  ${row.payee} ${row.month}: ${money(row.totalCents)} ${fr ? "avant le" : "by"} ${row.dueDate ?? "?"}`),
    "",
    fr ? "KidEase ne garde jamais cet argent." : "KidEase never holds this money.",
  ];
  return lines;
}

/** Read-only JSON for API partners. No bank numbers, no SIN. */
export function packJson(input: { daycareId: string; from: string; to: string; stubs: readonly ApprovedStub[]; remitter: RemitterType; year: number }) {
  return {
    version: PACK_VERSION,
    daycareId: input.daycareId,
    from: input.from,
    to: input.to,
    currency: "CAD",
    amountsIn: "cents",
    stubs: input.stubs.map((s) => ({ ...s })),
    deductions: deductionTotals(input.stubs),
    employerCosts: employerCostTotals(input.stubs),
    remittances: remittanceSummary(input.stubs, input.remitter),
    slips: { t4: t4Slips(input.stubs, input.year), t4a: t4aSlips(input.stubs, input.year), rl1: rl1Slips(input.stubs, input.year) },
  };
}

/** All CSV files in the pack, by file name. */
export function packFiles(input: { stubs: readonly ApprovedStub[]; remitter: RemitterType; year: number; accounts?: AccountMap }): Record<string, string> {
  return {
    "pay-register.csv": payRegisterCsv(input.stubs),
    "deductions-by-type.csv": deductionsCsv(input.stubs),
    "employer-costs.csv": employerCostsCsv(input.stubs),
    "remittance-summary.csv": remittanceCsv(remittanceSummary(input.stubs, input.remitter)),
    "year-to-date.csv": ytdCsv(input.stubs, input.year),
    "t4-t4a-rl1.csv": slipsCsv(input.stubs, input.year),
    "xero-manual-journal.csv": xeroJournalCsv(input.stubs, input.accounts),
  };
}
