import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { tx } from "@/lib/copy";
import { dollarsToCents } from "@/lib/bill";
import { getSql } from "@/lib/db";
import {
  maskEmail,
  payoutReference,
  safePhoto,
  shapeBill,
  shapeEarningsDesk,
  type EarnBill,
  type EarningsResult,
  type MonthFacts,
  type RawEarnBill,
} from "@/lib/earnings-desk";
import { periodLabel } from "@/lib/stripe-methods";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { formatPlanCad } from "@/lib/upgrade-plans";

const BILL_LIMIT = 180;

type MoneyRow = {
  net_cents: number | null;
  amount_cents: number | null;
  platform_fee_cents: number | null;
  total: number | null;
  platform_fee: number | null;
};

export const loadEarningsDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<EarningsResult> => {
    try {
      return await centreDesk(context.userId);
    } catch {
      return { ok: false };
    }
  });

export const loadParentPayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; bills: EarnBill[]; maskedEmail: string | null } | { ok: false }> => {
    try {
      const sql = await getSql();
      const [rows, email] = await Promise.all([parentRows(sql, context.userId), userEmail(sql, context.userId)]);
      const items = await loadItems(sql, rows.map((row) => row.id));
      const bills = rows.flatMap((row) => {
        const bill = shapeBill(rawBill(row, items.get(row.id) ?? []), "parent");
        return bill ? [bill] : [];
      });
      return { ok: true, bills, maskedEmail: maskEmail(email) };
    } catch {
      return { ok: false };
    }
  });

export const sendEarningsStatement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { period?: string; locale?: string }) => {
    const locale: "en" | "fr" = data?.locale === "fr" ? "fr" : "en";
    return { period: String(data?.period || "").slice(0, 7), locale };
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean; maskedEmail: string | null }> => {
    if (!/^\d{4}-\d{2}$/.test(data.period)) return { ok: false, maskedEmail: null };
    try {
      const sql = await getSql();
      const email = await userEmail(sql, context.userId);
      const maskedEmail = maskEmail(email);
      if (!email || !maskedEmail) return { ok: false, maskedEmail };
      const desk = await centreDesk(context.userId);
      if (!desk.ok) return { ok: false, maskedEmail };
      const statement = desk.statements.find((item) => item.period === data.period);
      if (!statement) return { ok: false, maskedEmail };
      const locale = data.locale;
      const cad = (cents: number) => formatPlanCad(cents / 100, locale);
      const lines = [tx(locale, "earningsTitle"), periodLabel(statement.period, locale)];
      if (statement.grossCents != null) lines.push(`${tx(locale, "earningsGross")}: ${cad(statement.grossCents)}`);
      if (statement.feeCents != null) lines.push(`${tx(locale, "earningsServiceFee")}: ${cad(-statement.feeCents)}`);
      if (statement.netCents != null) lines.push(`${tx(locale, "earningsNet")}: ${cad(statement.netCents)}`);
      const text = lines.join("\n");
      const sent = await sendTransactionalMail({
        to: email,
        purpose: "earnings_statement",
        subject: `${tx(locale, "earningsStatement")} · ${periodLabel(statement.period, locale)}`,
        text,
        html: `<p>${text.replace(/[&<>]/g, (char) => (char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;")).replace(/\n/g, "<br>")}</p>`,
      });
      return { ok: sent.status === "sent", maskedEmail };
    } catch {
      return { ok: false, maskedEmail: null };
    }
  });

async function centreDesk(userId: string): Promise<EarningsResult> {
  const sql = await getSql();
  const start = new Date();
  start.setMonth(start.getMonth() - 23, 1);
  const startDay = start.toISOString().slice(0, 10);
  const [aggregates, billRows, email, payoutRow, attendance, tours] = await Promise.all([
    sql<{ period: string; status: string; net_cents: number; gross_cents: number; fee_cents: number }>`
      select
        substring(coalesce(nullif(i.period, ''), to_char(coalesce(i.paid_at, i.due_at, i.created_at), 'YYYY-MM')) from 1 for 7) as period,
        i.status,
        coalesce(sum(
          case
            when i.net_cents is not null then i.net_cents
            else greatest(
              coalesce(i.amount_cents, coalesce(i.total, 0) * 100) - coalesce(i.platform_fee_cents, coalesce(i.platform_fee, 0) * 100),
              0
            )
          end
        ), 0)::int as net_cents,
        coalesce(sum(coalesce(i.amount_cents, coalesce(i.total, 0) * 100)), 0)::int as gross_cents,
        coalesce(sum(coalesce(i.platform_fee_cents, coalesce(i.platform_fee, 0) * 100)), 0)::int as fee_cents
      from invoices i
      join provider_daycares p on p.daycare_id = i.daycare_id
      where p.user_id = ${userId}
        and i.status in ('paid', 'sent')
        and coalesce(i.paid_at, i.due_at, i.created_at) >= ${startDay}
      group by 1, 2
    `,
    billQuery(sql, userId, "centre"),
    userEmail(sql, userId),
    sql<{ n: number; enabled: number }>`
      select count(*)::int as n, coalesce(sum(case when s.payouts_enabled = 1 then 1 else 0 end), 0)::int as enabled
      from stripe_accounts s
      join provider_daycares p on p.daycare_id = s.daycare_id
      where p.user_id = ${userId}
    `.catch(() => []),
    sql<{ period: string; days: number; children: number }>`
      select substring(a.day::text from 1 for 7) as period,
        count(*)::int as days,
        count(distinct a.child_name)::int as children
      from attendance a
      join provider_daycares p on p.daycare_id = a.daycare_id
      where p.user_id = ${userId}
        and a.status in ('arrived', 'departed')
        and a.day >= ${startDay}
      group by 1
    `.catch(() => null),
    sql<{ period: string; tours: number }>`
      select to_char(t.responded_at, 'YYYY-MM') as period, count(*)::int as tours
      from tour_requests t
      join provider_daycares p on p.daycare_id = t.daycare_id
      where p.user_id = ${userId}
        and t.status = 'accepted'
        and t.responded_at is not null
        and t.responded_at >= ${startDay}
      group by 1
    `.catch(() => null),
  ]);
  const items = await loadItems(
    sql,
    billRows.map((row) => row.id),
  );
  const facts = factsMap(attendance, tours);
  const payouts = !payoutRow[0] || Number(payoutRow[0].n) < 1 ? "unknown" : Number(payoutRow[0].enabled) > 0 ? "on" : "off";
  return shapeEarningsDesk({
    aggregates: aggregates.map((row) => ({
      period: String(row.period || ""),
      status: row.status,
      netCents: Number(row.net_cents),
      grossCents: Number(row.gross_cents),
      feeCents: Number(row.fee_cents),
    })),
    bills: billRows.map((row) => rawBill(row, items.get(row.id) ?? [])),
    facts,
    payouts,
    maskedEmail: maskEmail(email),
    truncated: billRows.length >= BILL_LIMIT,
  });
}

function factsMap(
  attendance: { period: string; days: number; children: number }[] | null,
  tours: { period: string; tours: number }[] | null,
): Record<string, MonthFacts> | null {
  if (!attendance || !tours) return null;
  const map: Record<string, MonthFacts> = {};
  for (const row of attendance) {
    const period = String(row.period || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    map[period] = { days: Number(row.days) || 0, children: Number(row.children) || 0, tours: 0 };
  }
  for (const row of tours) {
    const period = String(row.period || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    const current = map[period] ?? { days: 0, children: 0, tours: 0 };
    current.tours = Number(row.tours) || 0;
    map[period] = current;
  }
  return map;
}

type BillRow = MoneyRow & {
  id: string;
  number: string | null;
  status: string;
  period: string | null;
  paid_at: string | null;
  due_at: string | null;
  receipt_url: string | null;
  daycare_id: string | null;
  parent_name: string | null;
  parent_image: string | null;
  child_name: string | null;
  centre_name: string | null;
  centre_photos: string | null;
  program_start: string | null;
  stripe_payout_id: string | null;
  stripe_transfer_id: string | null;
  scheduled_for: string | null;
};

async function billQuery(sql: Awaited<ReturnType<typeof getSql>>, userId: string, who: "centre" | "parent"): Promise<BillRow[]> {
  if (who === "parent") return parentRows(sql, userId);
  return sql<BillRow>`
    select i.id, i.number, i.status, i.period, i.paid_at, i.due_at, i.receipt_url, i.daycare_id,
      i.net_cents, i.amount_cents, i.platform_fee_cents, i.total, i.platform_fee,
      u.name as parent_name, u.image as parent_image, ch.name as child_name,
      d.name as centre_name, d.photos as centre_photos, b.start_date as program_start,
      po.stripe_payout_id, po.stripe_transfer_id, po.scheduled_for
    from invoices i
    join provider_daycares p on p.daycare_id = i.daycare_id
    left join daycares d on d.id = i.daycare_id
    left join "user" u on u.id = i.parent_user_id
    left join children ch on ch.id = i.child_id
    left join bookings b on b.id = i.booking_id
    left join payouts po on po.daycare_id = i.daycare_id and po.period = substring(coalesce(i.period, '') from 1 for 7)
    where p.user_id = ${userId}
      and i.status in ('paid', 'sent')
    order by coalesce(i.paid_at, i.due_at, i.created_at) desc
    limit ${BILL_LIMIT}
  `;
}

async function parentRows(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<BillRow[]> {
  return sql<BillRow>`
    select i.id, i.number, i.status, i.period, i.paid_at, i.due_at, i.receipt_url, i.daycare_id,
      i.net_cents, i.amount_cents, i.platform_fee_cents, i.total, i.platform_fee,
      u.name as parent_name, u.image as parent_image, ch.name as child_name,
      d.name as centre_name, d.photos as centre_photos, b.start_date as program_start,
      null::text as stripe_payout_id, null::text as stripe_transfer_id, null::text as scheduled_for
    from invoices i
    left join daycares d on d.id = i.daycare_id
    left join "user" u on u.id = i.parent_user_id
    left join children ch on ch.id = i.child_id
    left join bookings b on b.id = i.booking_id
    where i.parent_user_id = ${userId}
      and i.status = 'paid'
    order by coalesce(i.paid_at, i.created_at) desc
    limit ${BILL_LIMIT}
  `;
}

async function loadItems(sql: Awaited<ReturnType<typeof getSql>>, ids: string[]) {
  const map = new Map<string, RawEarnBill["items"]>();
  if (!ids.length) return map;
  const rows = await sql.query<{
    id: string;
    invoice_id: string;
    description: string;
    quantity: number | null;
    amount: number | null;
  }>(
    `select id, invoice_id, description, quantity, amount
     from invoice_items
     where invoice_id = any($1::text[])
     order by sort_order, id`,
    [ids],
  ).catch(() => []);
  for (const row of rows) {
    const quantity = Number(row.quantity);
    const amount = Number(row.amount);
    const cents = Number.isFinite(amount) ? Math.round(amount * (Number.isFinite(quantity) && quantity > 0 ? quantity : 1) * 100) : null;
    if (cents == null) continue;
    const list = map.get(row.invoice_id) ?? [];
    list.push({ id: row.id, description: row.description || "", cents });
    map.set(row.invoice_id, list);
  }
  return map;
}

function rawBill(row: BillRow, items: RawEarnBill["items"]): RawEarnBill {
  const gross = row.amount_cents != null && Number.isFinite(Number(row.amount_cents)) ? Number(row.amount_cents) : dollarsToCents(Number(row.total) || 0);
  const fee =
    row.platform_fee_cents != null && Number.isFinite(Number(row.platform_fee_cents))
      ? Number(row.platform_fee_cents)
      : dollarsToCents(Number(row.platform_fee) || 0);
  const net =
    row.net_cents != null && Number.isFinite(Number(row.net_cents)) ? Number(row.net_cents) : Math.max(0, gross - fee);
  return {
    id: row.id,
    status: row.status,
    grossCents: gross,
    feeCents: fee,
    netCents: net,
    period: row.period,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    payoutOn: row.scheduled_for ? String(row.scheduled_for).slice(0, 10) : null,
    parentName: row.parent_name,
    parentImage: row.parent_image,
    childName: row.child_name,
    number: row.number,
    centreName: row.centre_name,
    centrePhoto: safePhoto(row.centre_photos),
    listingId: row.daycare_id,
    payoutRef: payoutReference(row.stripe_payout_id, row.stripe_transfer_id),
    programStart: row.program_start ? String(row.program_start).slice(0, 10) : null,
    receiptUrl: row.receipt_url,
    items,
  };
}

async function userEmail(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<string | null> {
  const rows = await sql<{ email: string | null }>`select email from "user" where id = ${userId} limit 1`.catch(() => []);
  return rows[0]?.email ?? null;
}
