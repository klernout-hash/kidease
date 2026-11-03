/**
 * Yearly child care receipts. FEATURE_TAX_RECEIPTS defaults off.
 * Totals come from invoices marked paid. No email and no text.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { taxReceiptsEnabled } from "@/lib/features";
import {
  TAX_RECEIPT_ROW_CAP,
  buildTaxReceiptGroups,
  taxReceiptFileName,
  taxReceiptPdf,
  type CareDayFact,
  type InvoiceFact,
  type TaxReceiptGroup,
  type TaxReceiptKind,
} from "@/lib/tax-receipts";
import { listOwnedDaycareIds } from "./centre-access";

type InvoiceRow = {
  id: string;
  status: string;
  amount_cents: number | string | null;
  total: number | string | null;
  currency: string | null;
  paid_at: string | Date | null;
  period: string | null;
  stripe_invoice_id: string | null;
  parent_user_id: string;
  daycare_id: string;
  daycare_name: string;
  province: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  license_number: string | null;
  child_id: string | null;
  child_name: string | null;
  child_birthdate: string | null;
  parent_name: string | null;
};

type DayRow = {
  daycare_id: string;
  parent_user_id: string | null;
  child_name: string;
  day: string | Date;
};

const INVOICE_SQL = `
  select i.id, i.status, i.amount_cents, i.total, i.currency, i.paid_at, i.period,
         i.stripe_invoice_id, i.parent_user_id, i.daycare_id,
         d.name as daycare_name, d.province, d.address, d.city, d.postal_code, d.license_number,
         i.child_id, ch.name as child_name, ch.birthdate as child_birthdate,
         u.name as parent_name
  from invoices i
  join daycares d on d.id = i.daycare_id
  left join children ch on ch.id = i.child_id
  left join "user" u on u.id = i.parent_user_id
`;

function iso(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "").trim();
  return text || null;
}

function mapInvoice(row: InvoiceRow): InvoiceFact {
  return {
    id: String(row.id),
    status: String(row.status || ""),
    amountCents: row.amount_cents == null ? null : Number(row.amount_cents),
    totalDollars: row.total == null ? null : Number(row.total),
    currency: row.currency,
    paidAt: iso(row.paid_at),
    period: row.period,
    stripeInvoiceId: row.stripe_invoice_id,
    daycareId: row.daycare_id,
    daycareName: row.daycare_name,
    province: row.province,
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    licenseNumber: row.license_number,
    childId: row.child_id,
    childName: row.child_name,
    childBirthdate: row.child_birthdate,
    parentUserId: row.parent_user_id,
    parentName: row.parent_name,
  };
}

function mapDay(row: DayRow): CareDayFact {
  return {
    daycareId: row.daycare_id,
    parentUserId: String(row.parent_user_id || ""),
    childName: row.child_name,
    day: iso(row.day)?.slice(0, 10) || "",
  };
}

export type TaxReceiptDesk = {
  enabled: boolean;
  ok: boolean;
  reason?: "off" | "unavailable" | "too-many" | "none";
  years: number[];
  groups: TaxReceiptGroup[];
};

async function loadInvoices(userId: string, desk: "parent" | "centre"): Promise<TaxReceiptDesk> {
  if (!taxReceiptsEnabled()) return { enabled: false, ok: false, reason: "off", years: [], groups: [] };
  const sql = await getSql();
  let rows: InvoiceRow[];
  try {
    if (desk === "centre") {
      const centres = await listOwnedDaycareIds(sql, userId);
      if (!centres.length) return { enabled: true, ok: true, years: [], groups: [] };
      rows = await sql.query<InvoiceRow>(
        `${INVOICE_SQL}
         where i.status = 'paid' and i.daycare_id = any($1::text[])
         order by i.paid_at desc nulls last
         limit ${TAX_RECEIPT_ROW_CAP + 1}`,
        [centres],
      );
    } else {
      const { familyScopeFor } = await import("@/lib/server/coparent");
      const homeId = (await familyScopeFor(userId)).dataUserId;
      rows = await sql.query<InvoiceRow>(
        `${INVOICE_SQL}
         where i.status = 'paid' and i.parent_user_id = $1
         order by i.paid_at desc nulls last
         limit ${TAX_RECEIPT_ROW_CAP + 1}`,
        [homeId],
      );
    }
  } catch {
    return { enabled: true, ok: false, reason: "unavailable", years: [], groups: [] };
  }
  if (rows.length > TAX_RECEIPT_ROW_CAP) {
    return { enabled: true, ok: false, reason: "too-many", years: [], groups: [] };
  }
  const parentIds = [...new Set(rows.map((row) => row.parent_user_id).filter(Boolean))];
  const daycareIds = [...new Set(rows.map((row) => row.daycare_id).filter(Boolean))];
  let careDays: CareDayFact[] | undefined;
  if (parentIds.length && daycareIds.length) {
    try {
      const days = await sql.query<DayRow>(
        `select daycare_id, parent_user_id, child_name, day::text as day
         from attendance
         where status in ('arrived', 'departed')
           and parent_user_id = any($1::text[])
           and daycare_id = any($2::text[])`,
        [parentIds, daycareIds],
      );
      careDays = days.map(mapDay);
    } catch {
      careDays = undefined;
    }
  }
  const built = buildTaxReceiptGroups({ invoices: rows.map(mapInvoice), careDays });
  return { enabled: true, ok: true, years: built.years, groups: built.groups };
}

function safeId(raw: unknown, allowEmpty = false): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return allowEmpty ? "" : null;
  return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

function safeYear(raw: unknown): number | null {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

export const listTaxReceipts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { desk?: string }) => ({
    desk: input?.desk === "centre" ? ("centre" as const) : ("parent" as const),
  }))
  .handler(async ({ context, data }) => loadInvoices(context.userId, data.desk));

export const downloadTaxReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { desk?: string; year?: number; daycareId?: string; childId?: string; parentUserId?: string; kind?: string }) => ({
    desk: input?.desk === "centre" ? ("centre" as const) : ("parent" as const),
    year: input?.year,
    daycareId: input?.daycareId,
    childId: input?.childId,
    parentUserId: input?.parentUserId,
    kind: input?.kind === "rl24" ? ("rl24" as const) : input?.kind === "federal" ? ("federal" as const) : "",
  }))
  .handler(async ({ context, data }) => {
    const year = safeYear(data.year);
    const daycareId = safeId(data.daycareId);
    const childId = safeId(data.childId, true);
    const kind = data.kind === "rl24" || data.kind === "federal" ? (data.kind as TaxReceiptKind) : null;
    if (year == null || !daycareId || childId == null || !kind) {
      return { ok: false as const, reason: "none" as const };
    }
    const loaded = await loadInvoices(context.userId, data.desk);
    if (!loaded.enabled) return { ok: false as const, reason: "off" as const };
    if (!loaded.ok) return { ok: false as const, reason: loaded.reason === "too-many" ? ("too-many" as const) : ("unavailable" as const) };
    const wantedParent = data.desk === "centre" ? safeId(data.parentUserId) : null;
    const match = loaded.groups.find(
      (group) =>
        group.year === year &&
        group.daycareId === daycareId &&
        group.childId === childId &&
        (data.desk === "parent" || group.parentUserId === wantedParent),
    );
    if (!match) return { ok: false as const, reason: "none" as const };
    const pdf = taxReceiptPdf(match, kind);
    if (!pdf) return { ok: false as const, reason: "none" as const };
    return {
      ok: true as const,
      filename: taxReceiptFileName(kind, match.year, match.daycareName),
      pdfBase64: Buffer.from(pdf).toString("base64"),
    };
  });
