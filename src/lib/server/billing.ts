import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { currentPeriod, splitFee } from "@/lib/stripe-methods";
import { stripeChargesLive } from "@/lib/stripe-live";
import {
  type Bill,
  type BillParty,
  type BillStatus,
  dollarsToCents,
  parentCanSeeBill,
  parseBillStatus,
} from "@/lib/bill";
import { extractStripeBillRef, type StripeBillObject } from "@/lib/stripe-bill-event";
import { createStripeCheckoutSession } from "@/lib/server/stripe-checkout";
import { notifyParentBill, notifyPlatform } from "@/lib/server/notify";

type Sql = Awaited<ReturnType<typeof getSql>>;

type InvoiceRow = {
  id: string;
  number: string;
  booking_id: string | null;
  parent_user_id: string;
  daycare_id: string;
  daycare_name: string;
  child_id: string | null;
  child_name: string | null;
  parent_name: string | null;
  parent_email: string | null;
  period: string;
  status: string;
  currency: string;
  subtotal: number;
  platform_fee: number;
  total: number;
  amount_cents: number | null;
  platform_fee_cents: number | null;
  net_cents: number | null;
  due_at: string | null;
  paid_at: string | null;
  memo: string | null;
  created_by: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  receipt_url: string | null;
  sent_at: string | null;
  created_at: string;
};

const INVOICE_SELECT = `
  i.id, i.number, i.booking_id, i.parent_user_id, i.daycare_id, d.name as daycare_name,
  i.child_id, ch.name as child_name, u.name as parent_name, u.email as parent_email,
  i.period, i.status, i.currency, i.subtotal, i.platform_fee, i.total,
  i.amount_cents, i.platform_fee_cents, i.net_cents, i.due_at, i.paid_at, i.memo,
  i.created_by, i.stripe_checkout_session_id, i.stripe_payment_intent_id, i.receipt_url,
  i.sent_at, i.created_at
`;

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca").replace(/\/$/, "");
}

function mapBill(row: InvoiceRow): Bill {
  const dollars = Number(row.total) || 0;
  const feeDollars = Number(row.platform_fee) || 0;
  const amountCents = row.amount_cents != null ? Number(row.amount_cents) : dollarsToCents(dollars);
  const platformFeeCents =
    row.platform_fee_cents != null ? Number(row.platform_fee_cents) : dollarsToCents(feeDollars);
  const netCents = row.net_cents != null ? Number(row.net_cents) : Math.max(0, amountCents - platformFeeCents);
  return {
    id: row.id,
    number: row.number,
    daycareId: row.daycare_id,
    daycareName: row.daycare_name,
    parentUserId: row.parent_user_id,
    parentName: row.parent_name,
    parentEmail: row.parent_email,
    childId: row.child_id,
    childName: row.child_name,
    bookingId: row.booking_id,
    amountCents,
    currency: (row.currency || "cad").toLowerCase(),
    platformFeeCents,
    netCents,
    period: row.period,
    dueAt: row.due_at,
    status: parseBillStatus(row.status),
    memo: row.memo,
    receiptUrl: row.receipt_url,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    createdBy: row.created_by,
    sentAt: row.sent_at,
    paidAt: row.paid_at,
    createdAt: String(row.created_at),
  };
}

async function ownsCentre(sql: Sql, userId: string, daycareId: string) {
  const rows = await sql<{ user_id: string }>`
    select user_id from provider_daycares
    where user_id = ${userId} and daycare_id = ${daycareId}
    limit 1
  `;
  return Boolean(rows[0]);
}

async function loadInvoice(sql: Sql, id: string): Promise<InvoiceRow | null> {
  const found = await sql.query<InvoiceRow>(
    `select ${INVOICE_SELECT}
     from invoices i
     join daycares d on d.id = i.daycare_id
     left join children ch on ch.id = i.child_id
     left join "user" u on u.id = i.parent_user_id
     where i.id = $1
     limit 1`,
    [id],
  );
  return found[0] ?? null;
}

function nextBillNumber(id: string, at = new Date()) {
  const ym = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}`;
  return `KE-${ym}-${id.slice(-4).toUpperCase()}`;
}

async function postBillMessage(
  sql: Sql,
  bill: Pick<Bill, "parentUserId" | "daycareId" | "daycareName" | "amountCents" | "period" | "dueAt" | "status" | "id">,
  kind: "sent" | "paid",
) {
  const existing = await sql<{ id: string }>`
    select id from conversations
    where user_id = ${bill.parentUserId} and daycare_id = ${bill.daycareId}
    limit 1
  `.catch(() => []);
  let cid = existing[0]?.id ?? null;
  if (!cid) {
    cid = nid("cv");
    await sql`
      insert into conversations (id, user_id, daycare_id)
      values (${cid}, ${bill.parentUserId}, ${bill.daycareId})
      on conflict (user_id, daycare_id) do nothing
    `.catch(() => undefined);
    const again = await sql<{ id: string }>`
      select id from conversations
      where user_id = ${bill.parentUserId} and daycare_id = ${bill.daycareId}
      limit 1
    `.catch(() => []);
    cid = again[0]?.id ?? cid;
  }
  const dollars = Math.round(bill.amountCents / 100);
  const due = bill.dueAt ? ` Due ${bill.dueAt}.` : "";
  const payUrl = `${appOrigin()}/pay/bill/${bill.id}`;
  const body =
    kind === "sent"
      ? `New bill from ${bill.daycareName}: $${dollars} CAD for ${bill.period}.${due} Pay in KidEase: ${payUrl}`
      : `Bill paid: $${dollars} CAD for ${bill.period} at ${bill.daycareName}.`;
  await sql`
    insert into messages (id, conversation_id, sender, body, kind)
    values (${nid("msg")}, ${cid}, ${"system"}, ${body}, ${"notify"})
  `.catch(() => undefined);
  await sql`update conversations set last_at = now() where id = ${cid}`.catch(() => undefined);
}

async function recordPaymentRow(
  sql: Sql,
  bill: Bill,
  extras: { paymentIntentId?: string | null; chargeId?: string | null; receiptUrl?: string | null },
) {
  const dollars = Math.round(bill.amountCents / 100);
  const fee = Math.round(bill.platformFeeCents / 100);
  const existing = await sql<{ id: string }>`
    select id from payments where invoice_id = ${bill.id} limit 1
  `.catch(() => []);
  if (existing[0]) {
    await sql`
      update payments set
        status = ${"paid"},
        stripe_payment_intent = ${extras.paymentIntentId ?? null},
        stripe_charge_id = ${extras.chargeId ?? null},
        platform_fee = ${fee},
        net_amount = ${dollars - fee}
      where id = ${existing[0].id}
    `.catch(() => undefined);
    return existing[0].id;
  }
  const id = nid("pay");
  const reference = bill.number;
  await sql`
    insert into payments (
      id, user_id, booking_id, daycare_id, amount, method, status, reference,
      invoice_id, period, platform_fee, net_amount, stripe_payment_intent, stripe_charge_id
    ) values (
      ${id}, ${bill.parentUserId}, ${bill.bookingId}, ${bill.daycareId}, ${dollars},
      ${"card"}, ${"paid"}, ${reference}, ${bill.id}, ${bill.period}, ${fee}, ${dollars - fee},
      ${extras.paymentIntentId ?? null}, ${extras.chargeId ?? null}
    )
  `.catch(async () => {
    await sql`
      insert into payments (id, user_id, booking_id, daycare_id, amount, method, status, reference)
      values (${id}, ${bill.parentUserId}, ${bill.bookingId}, ${bill.daycareId}, ${dollars}, ${"card"}, ${"paid"}, ${reference})
    `.catch(() => undefined);
  });
  if (bill.bookingId) {
    await sql`update bookings set status = 'active' where id = ${bill.bookingId}`.catch(() => undefined);
  }
  return id;
}

export async function applyStripeBillEvent(input: {
  type: string;
  object?: StripeBillObject | null;
}): Promise<{ ok: true; billId: string | null; status?: BillStatus; handled: string }> {
  const type = input.type || "";
  const ref = extractStripeBillRef(input.object, type);
  const sql = await getSql();

  if (type === "charge.refunded" || type === "charge.refund.updated") {
    const bill = await findBillForStripe(sql, ref);
    if (!bill) return { ok: true, billId: null, handled: type };
    await sql`
      update invoices
      set status = ${"refunded"}, updated_at = now()
      where id = ${bill.id} and status = ${"paid"}
    `.catch(() => undefined);
    await sql`update payments set status = ${"refunded"} where invoice_id = ${bill.id}`.catch(() => undefined);
    return { ok: true, billId: bill.id, status: "refunded", handled: type };
  }

  if (!ref.paid && type !== "checkout.session.completed" && type !== "payment_intent.succeeded") {
    return { ok: true, billId: ref.billId, handled: type };
  }

  const bill = await findBillForStripe(sql, ref);
  if (!bill) return { ok: true, billId: ref.billId, handled: type };
  if (bill.status === "paid" || bill.status === "refunded" || bill.status === "void") {
    return { ok: true, billId: bill.id, status: bill.status, handled: type };
  }

  await sql`
    update invoices set
      status = ${"paid"},
      paid_at = coalesce(paid_at, now()),
      stripe_checkout_session_id = coalesce(${ref.sessionId}, stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(${ref.paymentIntentId}, stripe_payment_intent_id),
      stripe_charge_id = coalesce(${ref.chargeId}, stripe_charge_id),
      receipt_url = coalesce(${ref.receiptUrl}, receipt_url),
      updated_at = now()
    where id = ${bill.id}
  `;
  const fresh = mapBill({ ...(await loadInvoice(sql, bill.id))! });
  await recordPaymentRow(sql, fresh, ref);
  await postBillMessage(sql, fresh, "paid");
  try {
    await notifyPlatform({
      kind: "payment",
      title: "Bill paid",
      daycareName: fresh.daycareName,
      actorName: fresh.parentName,
      actorEmail: fresh.parentEmail,
      detail: `Bill ${fresh.number} · $${Math.round(fresh.amountCents / 100)} CAD · ${fresh.period}`,
    });
  } catch (err) {
    console.error("[kidease-bill] paid notify failed", err);
  }
  return { ok: true, billId: fresh.id, status: "paid", handled: type };
}

async function findBillForStripe(
  sql: Sql,
  ref: { billId: string | null; sessionId: string | null; paymentIntentId: string | null; chargeId: string | null },
): Promise<Bill | null> {
  if (ref.billId) {
    const row = await loadInvoice(sql, ref.billId);
    if (row) return mapBill(row);
  }
  if (ref.sessionId) {
    const rows = await sql.query<{ id: string }>(
      `select id from invoices where stripe_checkout_session_id = $1 limit 1`,
      [ref.sessionId],
    );
    if (rows[0]) {
      const row = await loadInvoice(sql, rows[0].id);
      if (row) return mapBill(row);
    }
  }
  if (ref.paymentIntentId) {
    const rows = await sql.query<{ id: string }>(
      `select id from invoices where stripe_payment_intent_id = $1 limit 1`,
      [ref.paymentIntentId],
    );
    if (rows[0]) {
      const row = await loadInvoice(sql, rows[0].id);
      if (row) return mapBill(row);
    }
  }
  return null;
}

export const listProviderBills = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<InvoiceRow>(
      `select ${INVOICE_SELECT}
       from invoices i
       join daycares d on d.id = i.daycare_id
       left join children ch on ch.id = i.child_id
       left join "user" u on u.id = i.parent_user_id
       where exists (
         select 1 from provider_daycares p
         where p.user_id = $1 and p.daycare_id = i.daycare_id
       )
       order by i.created_at desc
       limit 200`,
      [context.userId],
    ).catch(() => []);
    return {
      stripeLive: stripeChargesLive(),
      bills: rows.map(mapBill),
    };
  });

export const listParentBills = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<InvoiceRow>(
      `select ${INVOICE_SELECT}
       from invoices i
       join daycares d on d.id = i.daycare_id
       left join children ch on ch.id = i.child_id
       left join "user" u on u.id = i.parent_user_id
       where i.parent_user_id = $1
         and i.status <> 'draft'
       order by i.created_at desc
       limit 200`,
      [context.userId],
    ).catch(() => []);
    return {
      stripeLive: stripeChargesLive(),
      bills: rows.map(mapBill).filter((b) => parentCanSeeBill(b.status)),
    };
  });

export const listBillParties = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      name: string | null;
      email: string | null;
      daycare_id: string;
      daycare_name: string;
      child_id: string | null;
      child_name: string | null;
      booking_id: string;
      monthly_amount: number;
    }>`
      select b.user_id, u.name, u.email, b.daycare_id, d.name as daycare_name,
             ch.id as child_id, ch.name as child_name, b.id as booking_id, b.monthly_amount
      from bookings b
      join daycares d on d.id = b.daycare_id
      join "user" u on u.id = b.user_id
      left join children ch on ch.id = b.child_id
      where exists (
        select 1 from provider_daycares p
        where p.user_id = ${context.userId} and p.daycare_id = b.daycare_id
      )
      order by u.name, d.name, b.created_at desc
    `.catch(() => []);
    const map = new Map<string, BillParty>();
    for (const r of rows) {
      const key = `${r.user_id}:${r.daycare_id}`;
      let party = map.get(key);
      if (!party) {
        party = {
          userId: r.user_id,
          name: r.name,
          email: r.email,
          daycareId: r.daycare_id,
          daycareName: r.daycare_name,
          children: [],
          bookings: [],
        };
        map.set(key, party);
      }
      if (r.child_id && !party.children.some((c) => c.id === r.child_id)) {
        party.children.push({ id: r.child_id, name: r.child_name || "Child" });
      }
      if (!party.bookings.some((b) => b.id === r.booking_id)) {
        party.bookings.push({
          id: r.booking_id,
          childName: r.child_name,
          monthlyAmount: Number(r.monthly_amount) || 0,
        });
      }
    }
    return [...map.values()];
  });

export const createBill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      parentUserId: string;
      childId?: string | null;
      bookingId?: string | null;
      amountCad: number;
      period?: string;
      dueAt?: string | null;
      memo?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (!(await ownsCentre(sql, context.userId, data.daycareId))) {
      throw new Error("Not your listing");
    }
    const amountCad = Math.round(Number(data.amountCad));
    if (!Number.isFinite(amountCad) || amountCad < 1) throw new Error("Enter an amount in Canadian dollars");
    const parent = await sql<{ id: string }>`
      select id from "user" where id = ${data.parentUserId} limit 1
    `;
    if (!parent[0]) throw new Error("Parent not found");
    const linked = await sql<{ id: string }>`
      select id from bookings
      where user_id = ${data.parentUserId} and daycare_id = ${data.daycareId}
      limit 1
    `;
    if (!linked[0]) throw new Error("This parent does not have a request at your centre");
    let childId = data.childId?.trim() || null;
    if (childId) {
      const kid = await sql<{ id: string }>`
        select id from children where id = ${childId} and user_id = ${data.parentUserId} limit 1
      `;
      if (!kid[0]) childId = null;
    }
    let bookingId = data.bookingId?.trim() || null;
    if (bookingId) {
      const bk = await sql<{ id: string }>`
        select id from bookings
        where id = ${bookingId} and user_id = ${data.parentUserId} and daycare_id = ${data.daycareId}
        limit 1
      `;
      if (!bk[0]) bookingId = null;
    }
    const amountCents = dollarsToCents(amountCad);
    const split = splitFee(amountCents);
    const feeDollars = Math.round(split.platformFee / 100);
    const period = (data.period || currentPeriod()).trim() || currentPeriod();
    const dueAt = data.dueAt?.trim() || null;
    const memo = data.memo?.trim() || null;
    if (bookingId) {
      const clash = await sql<{ id: string }>`
        select id from invoices
        where booking_id = ${bookingId} and period = ${period} and status <> ${"void"}
        limit 1
      `.catch(() => []);
      if (clash[0]) throw new Error("A bill for this period already exists.");
    }
    const id = nid("bl");
    const number = nextBillNumber(id);
    await sql`
      insert into invoices (
        id, number, booking_id, parent_user_id, daycare_id, child_id, period, status, currency,
        subtotal, platform_fee, total, amount_cents, platform_fee_cents, net_cents,
        due_at, issued_by, memo, created_by
      ) values (
        ${id}, ${number}, ${bookingId}, ${data.parentUserId}, ${data.daycareId}, ${childId},
        ${period}, ${"draft"}, ${"cad"}, ${amountCad}, ${feeDollars}, ${amountCad},
        ${amountCents}, ${split.platformFee}, ${split.net}, ${dueAt}, ${"provider"}, ${memo}, ${context.userId}
      )
    `;
    const row = await loadInvoice(sql, id);
    if (!row) throw new Error("Could not save bill");
    return mapBill(row);
  });

export const sendBill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((billId: string) => billId)
  .handler(async ({ context, data: billId }) => {
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    if (!row) throw new Error("Bill not found");
    if (!(await ownsCentre(sql, context.userId, row.daycare_id))) throw new Error("Not your listing");
    const current = parseBillStatus(row.status);
    if (current === "paid" || current === "void" || current === "refunded") {
      throw new Error("This bill can no longer be sent");
    }
    await sql`
      update invoices
      set status = ${"sent"}, sent_at = coalesce(sent_at, now()), updated_at = now()
      where id = ${billId}
    `;
    const fresh = mapBill((await loadInvoice(sql, billId))!);
    await postBillMessage(sql, fresh, "sent");
    try {
      await notifyParentBill({
        to: fresh.parentEmail,
        parentName: fresh.parentName,
        daycareName: fresh.daycareName,
        amountLabel: `$${Math.round(fresh.amountCents / 100)} CAD`,
        period: fresh.period,
        dueAt: fresh.dueAt,
        payUrl: `${appOrigin()}/pay/bill/${fresh.id}`,
      });
    } catch (err) {
      console.error("[kidease-bill] send mail failed", err);
    }
    return fresh;
  });

export const voidBill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((billId: string) => billId)
  .handler(async ({ context, data: billId }) => {
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    if (!row) throw new Error("Bill not found");
    if (!(await ownsCentre(sql, context.userId, row.daycare_id))) throw new Error("Not your listing");
    const current = parseBillStatus(row.status);
    if (current === "paid" || current === "refunded") throw new Error("Paid bills cannot be voided");
    await sql`
      update invoices set status = ${"void"}, updated_at = now() where id = ${billId}
    `;
    return mapBill((await loadInvoice(sql, billId))!);
  });

export const getBill = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((billId: string) => billId)
  .handler(async ({ context, data: billId }) => {
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    if (!row) throw new Error("Bill not found");
    const bill = mapBill(row);
    const provider = await ownsCentre(sql, context.userId, bill.daycareId);
    const parent = bill.parentUserId === context.userId;
    if (!provider && !parent) throw new Error("Bill not found");
    if (parent && !parentCanSeeBill(bill.status)) throw new Error("Bill not found");
    return { bill, stripeLive: stripeChargesLive(), role: provider ? ("provider" as const) : ("parent" as const) };
  });

export const createBillCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((billId: string) => billId)
  .handler(async ({ context, data: billId }) => {
    if (!stripeChargesLive()) {
      throw new Error("Card Pay stays off until Stripe live keys are on. This bill is on the internal ledger (not charged).");
    }
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    if (!row) throw new Error("Bill not found");
    const bill = mapBill(row);
    if (bill.parentUserId !== context.userId) throw new Error("Bill not found");
    if (bill.status === "paid") return { url: null as string | null, alreadyPaid: true as const };
    if (bill.status !== "sent") throw new Error("This bill is not open to Pay");
    const connect = await sql<{ stripe_account_id: string | null; charges_enabled: number }>`
      select stripe_account_id, charges_enabled from stripe_accounts where daycare_id = ${bill.daycareId} limit 1
    `.catch(() => []);
    const destination =
      connect[0]?.charges_enabled && connect[0].stripe_account_id ? connect[0].stripe_account_id : null;
    const origin = appOrigin();
    const session = await createStripeCheckoutSession({
      billId: bill.id,
      number: bill.number,
      amountCents: bill.amountCents,
      currency: bill.currency,
      period: bill.period,
      daycareName: bill.daycareName,
      successUrl: `${origin}/pay/bill/${bill.id}?paid=1`,
      cancelUrl: `${origin}/pay/bill/${bill.id}`,
      customerEmail: bill.parentEmail,
      destinationAccount: destination,
      applicationFeeCents: destination ? bill.platformFeeCents : undefined,
    });
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
    await sql`
      update invoices set
        stripe_checkout_session_id = ${session.id},
        stripe_payment_intent_id = coalesce(${pi}, stripe_payment_intent_id),
        updated_at = now()
      where id = ${bill.id}
    `;
    if (!session.url) throw new Error("Stripe did not return a Pay link");
    return { url: session.url, alreadyPaid: false as const };
  });
