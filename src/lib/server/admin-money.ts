import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL, lookupUser } from "@/lib/server/notify";

export type MoneyDirection = "in" | "out";
export type MoneyKind = "tuition" | "promo" | "payout" | "invoice";

export type AdminMoneyRow = {
  id: string;
  direction: MoneyDirection;
  kind: MoneyKind;
  amount: number;
  fee: number;
  net: number;
  status: string;
  method: string | null;
  reference: string | null;
  period: string | null;
  daycareId: string | null;
  daycareName: string | null;
  slug: string | null;
  city: string | null;
  partyName: string | null;
  partyEmail: string | null;
  createdAt: string;
};

export type AdminMoneyLedger = {
  rows: AdminMoneyRow[];
  inPaid: number;
  inPending: number;
  outPaid: number;
  outPending: number;
  fees: number;
};

function operatorEmails() {
  const env = (process.env.ADMIN_EMAIL || ADMIN_EMAIL || "kyle@kidease.ca").trim().toLowerCase();
  return new Set(["kyle@kidease.ca", env].filter(Boolean));
}

async function requireOperator(userId: string) {
  const actor = await lookupUser(userId);
  const email = (actor.email || "").trim().toLowerCase();
  if (!operatorEmails().has(email)) throw new Error("Not authorized");
  return actor;
}

function paidStatus(status: string) {
  const s = status.toLowerCase();
  return s === "paid" || s === "active" || s === "succeeded" || s === "complete";
}

export const listAdminMoney = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireOperator(context.userId);
    const sql = await getSql();
    const rows: AdminMoneyRow[] = [];

    const payments = await sql<{
      id: string;
      amount: number;
      method: string | null;
      status: string;
      reference: string | null;
      created_at: string;
      daycare_id: string | null;
      platform_fee?: number | null;
      net_amount?: number | null;
      period?: string | null;
      daycare_name: string | null;
      slug: string | null;
      city: string | null;
      payer_name: string | null;
      payer_email: string | null;
    }>`
      select p.id, p.amount, p.method, p.status, p.reference, p.created_at, p.daycare_id,
             coalesce(p.platform_fee, 0) as platform_fee,
             coalesce(p.net_amount, 0) as net_amount,
             p.period,
             d.name as daycare_name, d.slug, d.city,
             u.name as payer_name, u.email as payer_email
      from payments p
      left join daycares d on d.id = p.daycare_id
      left join "user" u on u.id = p.user_id
      order by p.created_at desc
      limit 300
    `.catch(async () => {
      return sql<{
        id: string;
        amount: number;
        method: string | null;
        status: string;
        reference: string | null;
        created_at: string;
        daycare_id: string | null;
        daycare_name: string | null;
        slug: string | null;
        city: string | null;
        payer_name: string | null;
        payer_email: string | null;
      }>`
        select p.id, p.amount, p.method, p.status, p.reference, p.created_at, p.daycare_id,
               d.name as daycare_name, d.slug, d.city,
               u.name as payer_name, u.email as payer_email
        from payments p
        left join daycares d on d.id = p.daycare_id
        left join "user" u on u.id = p.user_id
        order by p.created_at desc
        limit 300
      `.catch(() => []);
    });

    for (const p of payments) {
      const amount = Number(p.amount) || 0;
      const fee = Number((p as { platform_fee?: number }).platform_fee) || 0;
      const net = Number((p as { net_amount?: number }).net_amount) || amount - fee;
      rows.push({
        id: p.id,
        direction: "in",
        kind: "tuition",
        amount,
        fee,
        net,
        status: p.status,
        method: p.method,
        reference: p.reference,
        period: (p as { period?: string | null }).period ?? null,
        daycareId: p.daycare_id,
        daycareName: p.daycare_name,
        slug: p.slug,
        city: p.city,
        partyName: p.payer_name,
        partyEmail: p.payer_email,
        createdAt: String(p.created_at),
      });
    }

    const promos = await sql<{
      id: string;
      amount: number;
      status: string;
      plan: string;
      created_at: string;
      daycare_id: string;
      daycare_name: string | null;
      slug: string | null;
      city: string | null;
      party_name: string | null;
      party_email: string | null;
    }>`
      select pr.id, pr.amount, pr.status, pr.plan, pr.created_at, pr.daycare_id,
             d.name as daycare_name, d.slug, d.city,
             u.name as party_name, u.email as party_email
      from listing_promos pr
      left join daycares d on d.id = pr.daycare_id
      left join "user" u on u.id = pr.user_id
      order by pr.created_at desc
      limit 200
    `.catch(() => []);

    for (const p of promos) {
      const amount = Number(p.amount) || 0;
      rows.push({
        id: p.id,
        direction: "in",
        kind: "promo",
        amount,
        fee: 0,
        net: amount,
        status: p.status,
        method: p.plan,
        reference: p.plan,
        period: null,
        daycareId: p.daycare_id,
        daycareName: p.daycare_name,
        slug: p.slug,
        city: p.city,
        partyName: p.party_name,
        partyEmail: p.party_email,
        createdAt: String(p.created_at),
      });
    }

    const payouts = await sql<{
      id: string;
      gross: number;
      platform_fee: number;
      net: number;
      status: string;
      period: string | null;
      created_at: string;
      paid_at: string | null;
      daycare_id: string;
      daycare_name: string | null;
      slug: string | null;
      city: string | null;
    }>`
      select po.id, po.gross, po.platform_fee, po.net, po.status, po.period, po.created_at, po.paid_at,
             po.daycare_id, d.name as daycare_name, d.slug, d.city
      from payouts po
      left join daycares d on d.id = po.daycare_id
      order by coalesce(po.paid_at, po.created_at) desc
      limit 200
    `.catch(() => []);

    for (const p of payouts) {
      rows.push({
        id: p.id,
        direction: "out",
        kind: "payout",
        amount: Number(p.gross) || 0,
        fee: Number(p.platform_fee) || 0,
        net: Number(p.net) || 0,
        status: p.status,
        method: "payout",
        reference: p.period,
        period: p.period,
        daycareId: p.daycare_id,
        daycareName: p.daycare_name,
        slug: p.slug,
        city: p.city,
        partyName: p.daycare_name,
        partyEmail: null,
        createdAt: String(p.paid_at || p.created_at),
      });
    }

    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const ledger: AdminMoneyLedger = {
      rows,
      inPaid: 0,
      inPending: 0,
      outPaid: 0,
      outPending: 0,
      fees: 0,
    };
    for (const r of rows) {
      if (r.direction === "in") {
        if (paidStatus(r.status)) ledger.inPaid += r.amount;
        else ledger.inPending += r.amount;
        ledger.fees += r.fee;
      } else {
        if (paidStatus(r.status)) ledger.outPaid += r.net || r.amount;
        else ledger.outPending += r.net || r.amount;
        ledger.fees += r.fee;
      }
    }
    return ledger;
  });
