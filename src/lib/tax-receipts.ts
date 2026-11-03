/**
 * Child care receipts from bills already marked paid.
 * Ontario and the other provinces get a federal receipt for form T778.
 * Quebec also gets an RL-24 summary.
 * Amounts are the sum of those paid bills. Nothing is filled in from a fee table.
 * Blank lines mean the fact is not stored. No barcode and no social insurance number.
 */

import { canadaProvinceCode } from "./gap-features.ts";
import { renderTextPdf } from "./gov/pdf.ts";

export const TAX_RECEIPT_ROW_CAP = 5000;

export type InvoiceFact = {
  id: string;
  status: string;
  /** Cents, when the bill stored them. */
  amountCents: number | null;
  /** Dollar total on the same bill. Used only when cents were not stored. */
  totalDollars?: number | null;
  currency?: string | null;
  paidAt?: string | null;
  period?: string | null;
  stripeInvoiceId?: string | null;
  daycareId: string;
  daycareName: string;
  province?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  licenseNumber?: string | null;
  childId?: string | null;
  childName?: string | null;
  childBirthdate?: string | null;
  parentUserId: string;
  parentName?: string | null;
};

export type CareDayFact = {
  daycareId: string;
  parentUserId: string;
  childName: string;
  day: string;
};

export type TaxReceiptGroup = {
  year: number;
  daycareId: string;
  daycareName: string;
  province: string;
  addressLine: string;
  licenseNumber: string;
  childId: string;
  childName: string;
  childBirthdate: string;
  parentUserId: string;
  parentName: string;
  amountCents: number;
  invoiceCount: number;
  periodStart: string;
  periodEnd: string;
  daysOfCare: number | null;
  reference: string;
};

export type TaxReceiptKind = "federal" | "rl24";

function clean(value: string | null | undefined, max = 120): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanId(value: string | null | undefined): string {
  return clean(value, 80);
}

export function cadFromCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  const dollars = Math.floor(safe / 100);
  const rem = safe % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${String(rem).padStart(2, "0")}`;
}

function asCents(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n);
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return cents;
}

/** Paid Canadian bills only. A missing cent amount can use the dollar total on that same bill. */
export function paidCents(row: InvoiceFact): number | null {
  if (clean(row.status, 40).toLowerCase() !== "paid") return null;
  const currency = clean(row.currency || "cad", 12).toLowerCase();
  if (currency && currency !== "cad") return null;
  if (row.amountCents != null) return asCents(row.amountCents);
  const dollars = row.totalDollars;
  if (dollars == null || !Number.isFinite(dollars) || dollars < 0) return null;
  return asCents(Math.round(dollars * 100));
}

export function taxYearOf(row: InvoiceFact): number | null {
  const paid = clean(row.paidAt, 40);
  const paidDay = /^(\d{4})-\d{2}-\d{2}/.exec(paid);
  if (paidDay) {
    const year = Number(paidDay[1]);
    if (year >= 2000 && year <= 2100) return year;
  }
  const period = clean(row.period, 20);
  const periodYear = /^(\d{4})(?:-\d{2})?$/.exec(period);
  if (!periodYear) return null;
  const year = Number(periodYear[1]);
  return year >= 2000 && year <= 2100 ? year : null;
}

function datesFor(row: InvoiceFact, year: number): string[] {
  const out: string[] = [];
  const paid = /^(\d{4}-\d{2}-\d{2})/.exec(clean(row.paidAt, 40));
  if (paid && paid[1].startsWith(String(year))) out.push(paid[1]);
  const period = clean(row.period, 20);
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month && Number(month[1]) === year) {
    const m = Number(month[2]);
    if (m >= 1 && m <= 12) {
      const mm = month[2];
      const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
      out.push(`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, "0")}`);
    }
  } else if (period === String(year)) {
    out.push(`${year}-01-01`, `${year}-12-31`);
  }
  return out;
}

function personKey(value: string): string {
  return clean(value, 80).toLowerCase();
}

function countDays(
  days: readonly CareDayFact[] | undefined,
  group: { year: number; daycareId: string; parentUserId: string; childName: string },
): number | null {
  if (!days || !group.childName) return null;
  const seen = new Set<string>();
  for (const day of days) {
    if (cleanId(day.daycareId) !== group.daycareId) continue;
    if (cleanId(day.parentUserId) !== group.parentUserId) continue;
    if (personKey(day.childName) !== personKey(group.childName)) continue;
    const date = /^(\d{4}-\d{2}-\d{2})/.exec(clean(day.day, 20));
    if (!date || !date[1].startsWith(String(group.year))) continue;
    seen.add(date[1]);
  }
  return seen.size > 0 ? seen.size : null;
}

export function addressLine(parts: {
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}): string {
  return [parts.address, parts.city, parts.province, parts.postalCode]
    .map((part) => clean(part, 80))
    .filter(Boolean)
    .join(", ")
    .slice(0, 180);
}

export function receiptReference(year: number, daycareId: string, childId: string, parentUserId: string): string {
  const raw = `${year}|${daycareId}|${childId}|${parentUserId}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = (Math.imul(hash, 33) + raw.charCodeAt(i)) >>> 0;
  return `KE-${year}-${hash.toString(36).toUpperCase()}`;
}

function birthdate(raw: string | null | undefined): string {
  const value = clean(raw, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function dedupe(rows: readonly InvoiceFact[]): InvoiceFact[] {
  const seenId = new Set<string>();
  const seenStripe = new Set<string>();
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => cleanId(a.row.id).localeCompare(cleanId(b.row.id)) || a.index - b.index);
  const out: InvoiceFact[] = [];
  for (const item of ordered) {
    const id = cleanId(item.row.id);
    if (!id || seenId.has(id)) continue;
    const stripe = clean(item.row.stripeInvoiceId, 80);
    if (stripe && seenStripe.has(stripe)) continue;
    seenId.add(id);
    if (stripe) seenStripe.add(stripe);
    out.push(item.row);
  }
  return out;
}

export function buildTaxReceiptGroups(input: {
  invoices: readonly InvoiceFact[];
  careDays?: readonly CareDayFact[];
  capped?: boolean;
}): { groups: TaxReceiptGroup[]; years: number[]; truncated: boolean } {
  if (input.capped || input.invoices.length > TAX_RECEIPT_ROW_CAP) {
    return { groups: [], years: [], truncated: true };
  }
  const years = new Set<number>();
  const buckets = new Map<string, { facts: InvoiceFact[]; cents: number; dates: string[] }>();
  for (const row of dedupe(input.invoices)) {
    const cents = paidCents(row);
    const year = cents == null || cents === 0 ? null : taxYearOf(row);
    if (cents == null || year == null) continue;
    const daycareId = cleanId(row.daycareId);
    const parentUserId = cleanId(row.parentUserId);
    if (!daycareId || !parentUserId) continue;
    years.add(year);
    const childId = cleanId(row.childId);
    const key = `${year}|${daycareId}|${childId}|${parentUserId}`;
    const bucket = buckets.get(key) ?? { facts: [], cents: 0, dates: [] };
    bucket.facts.push(row);
    bucket.cents += cents;
    bucket.dates.push(...datesFor(row, year));
    buckets.set(key, bucket);
  }
  const groups: TaxReceiptGroup[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.cents <= 0) continue;
    const [yearStr, daycareId, childId, parentUserId] = key.split("|");
    const year = Number(yearStr);
    const sample = bucket.facts[0];
    if (!sample || !daycareId || !parentUserId) continue;
    const named = bucket.facts.find((row) => clean(row.childName)) ?? sample;
    const licensed = bucket.facts.find((row) => clean(row.licenseNumber, 40)) ?? sample;
    const dated = [...bucket.dates].sort();
    const childName = clean(named.childName, 80);
    const province = canadaProvinceCode(sample.province) ?? "";
    groups.push({
      year,
      daycareId,
      daycareName: clean(sample.daycareName, 120) || "Centre",
      province,
      addressLine: addressLine(sample),
      licenseNumber: clean(licensed.licenseNumber, 40),
      childId,
      childName,
      childBirthdate: birthdate(named.childBirthdate),
      parentUserId,
      parentName: clean(sample.parentName, 120) || "Name not on file",
      amountCents: bucket.cents,
      invoiceCount: bucket.facts.length,
      periodStart: dated[0] || `${year}-01-01`,
      periodEnd: dated[dated.length - 1] || `${year}-12-31`,
      daysOfCare: countDays(input.careDays, { year, daycareId, parentUserId, childName }),
      reference: receiptReference(year, daycareId, childId, parentUserId),
    });
  }
  groups.sort(
    (a, b) =>
      a.daycareName.localeCompare(b.daycareName) ||
      a.childName.localeCompare(b.childName) ||
      a.parentName.localeCompare(b.parentName),
  );
  return { groups, years: [...years].sort((a, b) => b - a), truncated: false };
}

export function findTaxGroup(
  groups: readonly TaxReceiptGroup[],
  key: { year: number; daycareId: string; childId: string; parentUserId: string },
): TaxReceiptGroup | null {
  return (
    groups.find(
      (group) =>
        group.year === key.year &&
        group.daycareId === key.daycareId &&
        group.childId === key.childId &&
        group.parentUserId === key.parentUserId,
    ) ?? null
  );
}

function wrapLines(lines: readonly string[], width = 88): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= width) {
      out.push(line);
      continue;
    }
    const words = line.split(" ");
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > width && current) {
        out.push(current);
        current = word;
      } else current = next;
    }
    if (current) out.push(current);
  }
  return out;
}

export function federalReceiptLines(group: TaxReceiptGroup): string[] {
  const ontario = group.province === "ON";
  const lines = [
    "KidEase",
    ontario ? "Ontario and federal child care receipt" : "Federal child care receipt",
    `Tax year: ${group.year}`,
    `Receipt for: ${group.parentName}`,
  ];
  if (group.childName) lines.push(`Child: ${group.childName}`);
  lines.push(`Centre: ${group.daycareName}`);
  if (group.addressLine) lines.push(`Address: ${group.addressLine}`);
  if (group.licenseNumber) lines.push(`Provider identification: ${group.licenseNumber}`);
  lines.push(
    `Amount: ${cadFromCents(group.amountCents)}`,
    `Period: ${group.periodStart} to ${group.periodEnd}`,
    `Paid bills: ${group.invoiceCount}`,
    `KidEase reference: ${group.reference}`,
    "",
    "This lists bills marked paid in KidEase for this year.",
    "It is not a government form and it has no barcode.",
    ontario
      ? "Ontario parents use this receipt with the federal form T778."
      : "Use this receipt with the federal form T778.",
    "KidEase does not decide the tax credit.",
  );
  return lines;
}

const NOT_ON_FILE = "(not on file)";

export function rl24ReceiptLines(group: TaxReceiptGroup): string[] | null {
  if (group.province !== "QC") return null;
  const lines = [
    "KidEase",
    "Quebec RL-24 child care summary",
    `Tax year: ${group.year}`,
    `Receipt for: ${group.parentName}`,
    `Child: ${group.childName || NOT_ON_FILE}`,
    `Centre: ${group.daycareName}`,
  ];
  if (group.addressLine) lines.push(`Address: ${group.addressLine}`);
  lines.push(
    `Amount: ${cadFromCents(group.amountCents)}`,
    `Period: ${group.periodStart} to ${group.periodEnd}`,
    `A Date of birth: ${group.childBirthdate || NOT_ON_FILE}`,
    `B.1 Days of care: ${group.daysOfCare == null ? NOT_ON_FILE : String(group.daysOfCare)}`,
    "B.2 Camp or boarding weeks: (not on file)",
    `C Total paid: ${cadFromCents(group.amountCents)}`,
    "D Does not qualify: (not on file)",
    "E Qualifies for the credit: (not on file)",
    "G Social insurance number: (not stored)",
    `H Provider identification: ${group.licenseNumber || NOT_ON_FILE}`,
    `Paid bills: ${group.invoiceCount}`,
    `KidEase reference: ${group.reference}`,
    "",
    "Box C is the total of bills marked paid in KidEase.",
    "Box E is blank because KidEase does not decide the tax credit.",
    "This is not an official Revenu Quebec slip and it has no barcode.",
  );
  return lines;
}

export function taxReceiptLines(group: TaxReceiptGroup, kind: TaxReceiptKind): string[] | null {
  if (group.amountCents <= 0) return null;
  return kind === "rl24" ? rl24ReceiptLines(group) : federalReceiptLines(group);
}

export function taxReceiptPdf(group: TaxReceiptGroup, kind: TaxReceiptKind): Uint8Array | null {
  const lines = taxReceiptLines(group, kind);
  if (!lines) return null;
  return renderTextPdf(wrapLines(lines));
}

export function taxReceiptFileName(kind: TaxReceiptKind, year: number, centre: string): string {
  const slug = clean(centre, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "centre";
  const name = kind === "rl24" ? "rl-24" : "child-care";
  return `kidease-${name}-${year}-${slug}.pdf`;
}
