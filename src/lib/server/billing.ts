import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { connectLiveEnabled, parentChargeQuote, quoteShownOnPayPage } from "@/lib/connect-payments";
import {
  centreUsesTestStripe,
  payerUsesTestStripe,
  stripeCredentialsForMode,
  type PaymentStripeMode,
} from "@/lib/stripe-route";
import { currentPeriod, platformFeeBps } from "@/lib/stripe-methods";
import { stripeChargesLive } from "@/lib/stripe-live";
import {
  type Bill,
  type BillParty,
  type BillStatus,
  dollarsToCents,
  isoOrNull,
  parentCanSeeBill,
  parseBillStatus,
} from "@/lib/bill";
import { canCreateBillForCentre, canReadBill, decideBillCheckout, resolveConnectDestination } from "@/lib/access-control";
import { extractStripeBillRef, stripePaymentSettlesBill, type StripeBillObject } from "@/lib/stripe-bill-event";
import { createStripeCheckoutSession, retrieveStripeCheckoutSession } from "@/lib/server/stripe-checkout";
import { rememberStripeCustomer } from "@/lib/server/stripe-lifecycle";
import { notifyParentBill, notifyParentBillState, notifyPlatform } from "@/lib/server/notify";
import { parseRefundState, planRefund } from "@/lib/wallet-ease";
import {
  parsePaymentState,
  paymentStateMessage,
  planPaymentStateEvent,
  type BillPaymentState,
} from "@/lib/payment-state";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { normalizeCheckoutLocale } from "@/lib/stripe-wallets";

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
  province: string | null;
};

const INVOICE_SELECT = `
  i.id, i.number, i.booking_id, i.parent_user_id, i.daycare_id, d.name as daycare_name,
  i.child_id, ch.name as child_name, u.name as parent_name, u.email as parent_email,
  i.period, i.status, i.currency, i.subtotal, i.platform_fee, i.total,
  i.amount_cents, i.platform_fee_cents, i.net_cents, i.due_at, i.paid_at, i.memo,
  i.created_by, i.stripe_checkout_session_id, i.stripe_payment_intent_id, i.receipt_url,
  i.sent_at, i.created_at, d.province
`;

/** Live card pay for a centre bill. The secret must be live and KIDEASE_CONNECT_LIVE must be exactly 1. */
function parentBillCardLive(): boolean {
  return stripeChargesLive() && connectLiveEnabled();
}

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
    dueAt: isoOrNull(row.due_at, true),
    status: parseBillStatus(row.status),
    memo: row.memo,
    receiptUrl: row.receipt_url,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    createdBy: row.created_by,
    sentAt: isoOrNull(row.sent_at),
    paidAt: isoOrNull(row.paid_at),
    createdAt: isoOrNull(row.created_at) ?? "",
  };
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

type CentreStripeFlags = {
  id?: string | null;
  slug: string | null;
  visibility: string | null;
  is_test: number | boolean | null;
  is_demo: number | boolean | null;
};

/**
 * The Stripe mode a bill is charged and settled in. Test only for a parent
 * with the server-set profiles.is_test flag or a QA centre; never from an email.
 */
async function billStripeMode(
  sql: Sql,
  bill: Pick<Bill, "parentUserId" | "daycareId">,
  centre?: CentreStripeFlags | null,
): Promise<PaymentStripeMode> {
  const payer = await sql<{ is_test: number | boolean | null }>`
    select is_test from profiles where user_id = ${bill.parentUserId} limit 1
  `.catch(() => [] as { is_test: number | boolean | null }[]);
  const flags =
    centre ??
    (
      await sql<CentreStripeFlags>`
        select id, slug, visibility, is_test, is_demo from daycares where id = ${bill.daycareId} limit 1
      `.catch(() => [] as CentreStripeFlags[])
    )[0];
  const qa =
    payerUsesTestStripe({ isTest: payer[0]?.is_test }) ||
    centreUsesTestStripe({
      id: flags?.id || bill.daycareId,
      slug: flags?.slug,
      visibility: flags?.visibility,
      isTest: flags?.is_test,
      isDemo: flags?.is_demo,
    });
  return qa ? "test" : "live";
}

function nextBillNumber(id: string, at = new Date()) {
  const ym = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}`;
  return `KE-${ym}-${id.slice(-4).toUpperCase()}`;
}

async function postBillMessage(
  sql: Sql,
  bill: Pick<Bill, "parentUserId" | "daycareId" | "daycareName" | "amountCents" | "period" | "dueAt" | "status" | "id">,
  kind: "sent" | "paid" | BillPaymentState,
  text?: string,
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
  const body = text
    ? text
    : kind === "sent"
      ? `New bill from ${bill.daycareName}: ${formatPlanCad(dollars, "en")} for ${bill.period}.${due} Pay in KidEase: ${payUrl}`
      : `Bill paid: ${formatPlanCad(dollars, "en")} for ${bill.period} at ${bill.daycareName}.`;
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
  const net = dollars;
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
        net_amount = ${net}
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
      ${"card"}, ${"paid"}, ${reference}, ${bill.id}, ${bill.period}, ${fee}, ${net},
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
  /** The signed event's livemode. Must agree with the object's own livemode. */
  livemode?: boolean | null;
}): Promise<{ ok: true; billId: string | null; status?: BillStatus; handled: string }> {
  const type = input.type || "";
  const ref = extractStripeBillRef(input.object, type);
  const sql = await getSql();

  if (type === "charge.refunded" || type === "charge.refund.updated") {
    const bill = await findBillForStripe(sql, ref);
    if (!bill) return { ok: true, billId: null, handled: type };
    // PE-8: refunded only for the full amount. A partial refund keeps the bill
    // Paid and sets refund_state = 'partly_refunded' (BillStatus is unchanged).
    const refund = planRefund(input.object as unknown as Parameters<typeof planRefund>[0]);
    await sql`
      update invoices set
        refunded_cents = ${refund.refundedCents},
        refund_state = ${refund.refundState},
        refunded_at = now(),
        refund_method_label = coalesce(${refund.methodLabel}, refund_method_label)
      where id = ${bill.id}
    `.catch(() => undefined);
    if (!refund.fullRefund) {
      // No status: the bill stays Paid, and the paid-only side effects do not run again.
      return { ok: true, billId: bill.id, handled: type };
    }
    await sql`
      update invoices
      set status = ${"refunded"}, updated_at = now()
      where id = ${bill.id} and status = ${"paid"}
    `.catch(() => undefined);
    await sql`update payments set status = ${"refunded"} where invoice_id = ${bill.id}`.catch(() => undefined);
    return { ok: true, billId: bill.id, status: "refunded", handled: type };
  }

  if (!ref.paid) {
    return { ok: true, billId: ref.billId, handled: type };
  }

  const bill = await findBillForStripe(sql, ref);
  if (!bill) return { ok: true, billId: ref.billId, handled: type };
  if (bill.status === "paid" || bill.status === "refunded" || bill.status === "void") {
    return { ok: true, billId: bill.id, status: bill.status, handled: type };
  }

  const eventLive = typeof input.livemode === "boolean" ? input.livemode : null;
  const livemode =
    eventLive !== null && ref.livemode !== null && eventLive !== ref.livemode ? null : (eventLive ?? ref.livemode);
  const mode = await billStripeMode(sql, bill);
  if (!stripePaymentSettlesBill({ ...ref, livemode }, { mode, amountCents: bill.amountCents, currency: bill.currency })) {
    console.error("[kidease-bill] Stripe payment does not match the bill", {
      billId: bill.id,
      mode,
      livemode,
      amountCents: ref.amountCents,
    });
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
  // Paid clears any processing / failed / requires_action state. Separate
  // statement so a database without migration 0231 still records the payment.
  await sql`
    update invoices set payment_state = null, last_error_code = null
    where id = ${bill.id} and payment_state is not null
  `.catch(() => undefined);
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
      detail: `Bill ${fresh.number} · ${formatPlanCad(Math.round(fresh.amountCents / 100), "en")} · ${fresh.period}`,
    });
  } catch (err) {
    console.error("[kidease-bill] paid notify failed", err);
  }
  return { ok: true, billId: fresh.id, status: "paid", handled: type };
}

type PaymentStateRow = {
  id: string;
  payment_state: string | null;
  last_error_code: string | null;
  failed_at: string | Date | null;
};

type RefundRow = {
  id: string;
  refunded_cents: number | null;
  refund_state: string | null;
  refunded_at: string | Date | null;
  refund_method_label: string | null;
};

/** Adds payment_state to bills. Read separately so a missing column never hides bills. */
async function withPaymentState(sql: Sql, bills: Bill[]): Promise<Bill[]> {
  if (!bills.length) return bills;
  const rows = await sql
    .query<PaymentStateRow>(
      `select id, payment_state, last_error_code, failed_at from invoices where id = any($1::text[])`,
      [bills.map((bill) => bill.id)],
    )
    .catch(() => [] as PaymentStateRow[]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const refunds = await sql
    .query<RefundRow>(
      `select id, refunded_cents, refund_state, refunded_at, refund_method_label from invoices where id = any($1::text[])`,
      [bills.map((bill) => bill.id)],
    )
    .catch(() => [] as RefundRow[]);
  const refundById = new Map(refunds.map((row) => [row.id, row]));
  return bills.map((source) => {
    const refund = refundById.get(source.id);
    const bill: Bill = refund
      ? {
          ...source,
          refundState: parseRefundState(refund.refund_state),
          refundedCents: refund.refunded_cents != null ? Number(refund.refunded_cents) : null,
          refundedAt: refund.refunded_at ? new Date(refund.refunded_at).toISOString() : null,
          refundMethodLabel: refund.refund_method_label,
        }
      : source;
    const row = byId.get(bill.id);
    if (!row) return bill;
    return {
      ...bill,
      // Only an open bill shows a payment state.
      paymentState: bill.status === "sent" ? parsePaymentState(row.payment_state) : null,
      lastErrorCode: row.last_error_code,
      failedAt: row.failed_at ? new Date(row.failed_at).toISOString() : null,
    };
  });
}

/**
 * payment_intent.processing / payment_failed / requires_action and
 * invoice.overdue. Never touches a paid, refunded, void or disputed bill.
 */
export async function applyStripePaymentStateEvent(input: {
  type: string;
  object?: StripeBillObject | null;
}): Promise<{ ok: true; billId: string | null; paymentState: BillPaymentState | null; handled: string; skipped?: string }> {
  const type = input.type || "";
  const ref = extractStripeBillRef(input.object, type);
  const sql = await getSql();
  let found = await findBillForStripe(sql, ref);
  if (!found) {
    // Invoice-created PaymentIntents may carry no bill metadata: match by the
    // Stripe invoice id (on the PI in older API versions, or the invoice itself).
    const raw = (input.object || {}) as { object?: string; id?: string; invoice?: string | { id?: string } | null };
    const stripeInvoiceId =
      raw.object === "invoice" ? String(raw.id || "") : typeof raw.invoice === "string" ? raw.invoice : String(raw.invoice?.id || "");
    if (stripeInvoiceId.startsWith("in_")) {
      const rows = await sql
        .query<{ id: string }>(`select id from invoices where stripe_invoice_id = $1 limit 1`, [stripeInvoiceId])
        .catch(() => [] as { id: string }[]);
      const row = rows[0] ? await loadInvoice(sql, rows[0].id) : null;
      if (row) found = mapBill(row);
    }
  }
  const current = found ? (await withPaymentState(sql, [found]))[0]! : null;
  const plan = planPaymentStateEvent(
    type,
    input.object,
    current ? { status: current.status, paymentState: current.paymentState ?? null } : null,
  );
  if (plan.kind === "skip") {
    return { ok: true, billId: current?.id ?? null, paymentState: current?.paymentState ?? null, handled: type, skipped: plan.reason };
  }
  const bill = current!;
  // status = 'sent' in the where clause: a bill paid in the meantime is never downgraded.
  await sql`
    update invoices set
      payment_state = ${plan.paymentState},
      processing_at = case when ${plan.stamp} = 'processing_at' then now() else processing_at end,
      failed_at = case when ${plan.stamp} = 'failed_at' then now() else failed_at end,
      overdue_at = case when ${plan.stamp} = 'overdue_at' then coalesce(overdue_at, now()) else overdue_at end,
      last_error_code = case when ${plan.paymentState} = 'failed' then ${plan.lastErrorCode} else last_error_code end,
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${ref.paymentIntentId}),
      updated_at = now()
    where id = ${bill.id} and status = ${"sent"}
  `;
  if (plan.notify) {
    await notifyPaymentState(sql, bill, plan.notify, plan.lastErrorCode).catch((err) => {
      console.error("[kidease-bill] payment state notice skipped", err instanceof Error ? err.message : "failed");
    });
  }
  return { ok: true, billId: bill.id, paymentState: plan.paymentState, handled: type };
}

async function notifyPaymentState(sql: Sql, bill: Bill, state: BillPaymentState, errorCode: string | null) {
  const profile = await sql<{ locale: string | null }>`
    select locale from profiles where user_id = ${bill.parentUserId} limit 1
  `.catch(() => [] as { locale: string | null }[]);
  const locale = profile[0]?.locale === "fr" ? "fr" : "en";
  const payUrl = `${appOrigin()}/pay/bill/${bill.id}`;
  const walletUrl = `${appOrigin()}/account?section=wallet&fix=${encodeURIComponent(bill.id)}`;
  const text = paymentStateMessage(state, {
    daycareName: bill.daycareName,
    amountLabel: formatPlanCad(bill.amountCents / 100, locale),
    payUrl,
    walletUrl,
    errorCode,
    locale,
  });
  await postBillMessage(sql, bill, state, text.body);
  if (state === "processing") return;
  const { sendPushNotification } = await import("@/lib/server/push.server");
  await sendPushNotification({ userId: bill.parentUserId, title: text.title, body: text.body, url: `/pay/bill/${bill.id}` }).catch(
    () => undefined,
  );
  await notifyParentBillState({
    to: bill.parentEmail,
    title: text.title,
    body: text.body,
    ctaLabel: state === "failed" ? (locale === "fr" ? "Payer de nouveau" : "Pay again") : locale === "fr" ? "Confirmer le paiement" : "Confirm payment",
    ctaUrl: payUrl,
    daycareName: bill.daycareName,
  });
  if (state === "requires_action") {
    const { captureServerProductEvent } = await import("@/lib/server/product-events");
    void captureServerProductEvent("payment_state_changed", { state, source: "centre_bill" });
  }
  if (state === "failed") {
    const { captureServerProductEvent } = await import("@/lib/server/product-events");
    void captureServerProductEvent("payment_state_changed", { state, source: "centre_bill", reason: errorCode || "unknown" });
  }
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

/** Owner centres stay on provider_daycares. A staff login needs a bills grant. */
async function billsScope(sql: Sql, userId: string) {
  const { explainBillsList, staffAreaError } = await import("@/lib/server/centre-access");
  const decision = await explainBillsList(sql, userId);
  if (!decision.ok) {
    if (decision.reason === "permission") throw staffAreaError(decision);
    return [] as string[];
  }
  return decision.daycareIds;
}

export const listProviderBills = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { daycareIdsForArea } = await import("@/lib/server/centre-access");
    const daycareIds = await billsScope(sql, context.userId);
    const editable = new Set(await daycareIdsForArea(sql, context.userId, "bills", "edit"));
    const rows = daycareIds.length
      ? await sql.query<InvoiceRow>(
          `select ${INVOICE_SELECT}
       from invoices i
       join daycares d on d.id = i.daycare_id
       left join children ch on ch.id = i.child_id
       left join "user" u on u.id = i.parent_user_id
       where i.daycare_id = any($1::text[])
       order by i.created_at desc
       limit 200`,
          [daycareIds],
        ).catch(() => [])
      : [];
    const moneyDesk = editable.size > 0;
    const { invoiceRemindersEnabled } = await import("@/lib/features");
    return {
      /** FEATURE_INVOICE_REMINDERS. Off: no Send reminder button. */
      remindersOn: moneyDesk && invoiceRemindersEnabled(),
      stripeLive: moneyDesk ? parentBillCardLive() : false,
      platformFeeBps: moneyDesk ? platformFeeBps() : null,
      bills: await withPaymentState(
        sql,
        rows
          .map((row) => ({ ...mapBill(row), parentEmail: null }))
          .filter((bill) => editable.has(bill.daycareId) || bill.status !== "draft"),
      ),
    };
  });

export const listParentBills = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { familyScopeFor } = await import("@/lib/server/coparent");
    const homeId = (await familyScopeFor(context.userId)).dataUserId;
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
      [homeId],
    ).catch(() => []);
    return {
      stripeLive: parentBillCardLive(),
      platformFeeBps: platformFeeBps(),
      bills: await withPaymentState(sql, rows.map(mapBill).filter((b) => parentCanSeeBill(b.status))),
    };
  });

export const listBillParties = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { daycareIdsForArea } = await import("@/lib/server/centre-access");
    const daycareIds = await daycareIdsForArea(sql, context.userId, "bills", "edit");
    if (!daycareIds.length) return [];
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
      where b.daycare_id = any(${daycareIds}::text[])
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
    const { assertStaffArea } = await import("@/lib/server/centre-access");
    await assertStaffArea(sql, context.userId, data.daycareId, "bills", "edit");
    if (!canCreateBillForCentre([data.daycareId], data.daycareId)) {
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
    const provinceRows = await sql<{ province: string }>`select province from daycares where id = ${data.daycareId} limit 1`.catch(() => []);
    const quote = parentChargeQuote({
      invoiceCents: amountCents,
      province: provinceRows[0]?.province,
      daycareId: data.daycareId,
    });
    const feeDollars = Math.round(quote.kidEaseFeeCents / 100);
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
        ${amountCents}, ${quote.kidEaseFeeCents}, ${quote.centreReceivesCents}, ${dueAt}, ${"provider"}, ${memo}, ${context.userId}
      )
    `;
    const row = await loadInvoice(sql, id);
    if (!row) throw new Error("Could not save bill");
    const { noteMonthlyUnchecked } = await import("@/lib/server/compliance-fees");
    await noteMonthlyUnchecked({
      daycareId: data.daycareId,
      province: provinceRows[0]?.province || "",
      monthlyCents: amountCents,
      userId: context.userId,
      source: "invoice",
    }).catch(() => undefined);
    return mapBill(row);
  });

export const sendBill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((billId: string) => billId)
  .handler(async ({ context, data: billId }) => {
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    if (!row) throw new Error("Bill not found");
    const { assertStaffArea } = await import("@/lib/server/centre-access");
    await assertStaffArea(sql, context.userId, row.daycare_id, "bills", "edit");
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
      const { attachConnectBill } = await import("@/lib/server/connect-payments");
      await attachConnectBill(fresh.id);
    } catch (err) {
      console.error("[kidease-connect] bill attach skipped", err);
    }
    try {
      await notifyParentBill({
        to: fresh.parentEmail,
        parentName: fresh.parentName,
        daycareName: fresh.daycareName,
        amountLabel: formatPlanCad(Math.round(fresh.amountCents / 100), "en"),
        period: fresh.period,
        dueAt: fresh.dueAt,
        payUrl: `${appOrigin()}/pay/bill/${fresh.id}`,
      });
    } catch (err) {
      console.error("[kidease-bill] send mail failed", err);
    }
    return fresh;
  });

/**
 * "Send reminder" on an unpaid (sent) bill. Behind FEATURE_INVOICE_REMINDERS,
 * same mail path and rules as the daily reminder job: without
 * FEATURE_INVOICE_REMINDERS_LIVE it is a dry run (logged, nothing sent), and
 * AUTOMATION_TEST_EMAILS limits who can receive it. One per bill per day.
 */
export const sendBillReminder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((billId: string) => String(billId || "").trim().slice(0, 80))
  .handler(async ({ context, data: billId }) => {
    const { invoiceRemindersEnabled } = await import("@/lib/features");
    if (!invoiceRemindersEnabled()) return { ok: false as const, reason: "off" as const };
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    if (!row) throw new Error("Bill not found");
    const { assertStaffArea } = await import("@/lib/server/centre-access");
    await assertStaffArea(sql, context.userId, row.daycare_id, "bills", "edit");
    const bill = mapBill(row);
    if (bill.status !== "sent" || bill.paidAt) return { ok: false as const, reason: "not_open" as const };
    if (!bill.parentEmail) return { ok: false as const, reason: "no_email" as const };
    const { automationModeFromEnv, automationLocale, automationQuietNow, parseAllowlist, AUTOMATION_FALLBACK_TZ } =
      await import("@/lib/automations");
    const { billReminderEmail } = await import("@/lib/notification-templates");
    const { renderBrandedEmail, renderBrandedText } = await import("@/lib/email-layout");
    const { showPayCtas } = await import("@/lib/features");
    const { dayKeyInTimeZone } = await import("@/lib/family-time");
    const { dispatchAutomationMail } = await import("@/lib/server/automation-mail");
    const prefs = await sql<{ locale: string | null; time_zone: string | null }>`
      select locale, time_zone from profiles where user_id = ${bill.parentUserId} limit 1
    `.catch(() => [] as { locale: string | null; time_zone: string | null }[]);
    const centreContact = await sql<{ phone: string | null; contact_email: string | null }>`
      select phone, contact_email from daycares where id = ${row.daycare_id} limit 1
    `.catch(() => [] as { phone: string | null; contact_email: string | null }[]);
    const now = new Date();
    // Polished EN/FR template (#1030). While pay buttons are off the copy never promises online payment.
    const mail = billReminderEmail({
      locale: automationLocale(prefs[0]?.locale) === "fr" ? "fr" : "en",
      parentName: bill.parentName,
      childName: bill.childName,
      centreName: bill.daycareName || "",
      centreEmail: centreContact[0]?.contact_email ?? null,
      centrePhone: centreContact[0]?.phone ?? null,
      number: bill.number,
      amountCents: bill.amountCents,
      dueDate: bill.dueAt,
      payOnline: showPayCtas(),
    });
    const letter = {
      subject: mail.subject,
      text: renderBrandedText(mail.branded),
      html: renderBrandedEmail(mail.branded),
      branded: mail.branded,
    };
    const result = await dispatchAutomationMail({
      automation: "invoice_reminder",
      dedupeKey: `manual:${bill.id}:${dayKeyInTimeZone(now, AUTOMATION_FALLBACK_TZ)}`,
      recipient: bill.parentEmail,
      subject: letter.subject,
      text: letter.text,
      html: letter.html,
      branded: letter.branded,
      mode: automationModeFromEnv("FEATURE_INVOICE_REMINDERS", process.env),
      quiet: automationQuietNow(now, prefs[0]?.time_zone ?? null, row.province ?? null),
      allowlist: parseAllowlist(process.env.AUTOMATION_TEST_EMAILS),
    });
    return { ok: true as const, result };
  });

export const voidBill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((billId: string) => billId)
  .handler(async ({ context, data: billId }) => {
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    if (!row) throw new Error("Bill not found");
    const { assertStaffArea } = await import("@/lib/server/centre-access");
    await assertStaffArea(sql, context.userId, row.daycare_id, "bills", "edit");
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
    // Centre flags and the Connect row only need the daycare id: fetch them
    // alongside the access check instead of one after another (Pay page speed).
    const centrePromise = sql<CentreStripeFlags>`
      select id, slug, visibility, is_test, is_demo from daycares where id = ${bill.daycareId} limit 1
    `.catch(() => [] as CentreStripeFlags[]);
    const connectPromise = sql<{ stripe_account_id: string | null; charges_enabled: number }>`
      select stripe_account_id, charges_enabled from stripe_accounts where daycare_id = ${bill.daycareId} limit 1
    `.catch(() => []);
    const { explainStaffArea, staffAreaError } = await import("@/lib/server/centre-access");
    const billAccess = await explainStaffArea(sql, context.userId, bill.daycareId, "bills", "view");
    if (!billAccess.ok && billAccess.reason !== "absent" && row.parent_user_id !== context.userId) throw staffAreaError(billAccess);
    const provider = billAccess.ok;
    const access = canReadBill({
      actorUserId: context.userId,
      parentUserId: bill.parentUserId,
      daycareId: bill.daycareId,
      ownedDaycareIds: provider ? [bill.daycareId] : [],
      status: bill.status,
    });
    if (!access.ok) throw new Error("Bill not found");
    const centre = (await centrePromise)[0] ?? null;
    const settled = await reconcilePaidCheckout(sql, bill, {
      mode: await billStripeMode(sql, bill, centre),
    });
    const current = (await withPaymentState(sql, [settled ?? bill]))[0]!;
    const connect = await connectPromise;
    const destination = resolveConnectDestination({
      stripeAccountId: connect[0]?.stripe_account_id,
      chargesEnabled: connect[0]?.charges_enabled,
    });
    const serviceFee = quoteShownOnPayPage(
      parentChargeQuote({
        invoiceCents: current.amountCents,
        bps: platformFeeBps(),
        province: row.province,
        daycareId: current.daycareId,
      }),
      Boolean(destination),
    );
    return { bill: current, stripeLive: parentBillCardLive(), role: access.role, platformFeeBps: platformFeeBps(), serviceFee };
  });

async function reconcilePaidCheckout(
  sql: Sql,
  bill: Bill,
  opts: { mode: PaymentStripeMode },
): Promise<Bill | null> {
  if (bill.status !== "sent") return bill;
  const sessionId = (bill.stripeCheckoutSessionId || "").trim();
  if (!sessionId.startsWith("cs_")) return bill;
  const qa = opts.mode === "test";
  const creds = stripeCredentialsForMode(opts.mode, process.env);
  const secret = qa ? (creds.ok && !creds.secret.startsWith("sk_live_") ? creds.secret : "") : creds.ok ? creds.secret : "";
  if (!secret) return bill;
  try {
    // One read: livemode and amount_total below come from this same session.
    const session = await retrieveStripeCheckoutSession(sessionId, { secret, qa });
    if (session.payment_status !== "paid") return bill;
    await applyStripeBillEvent({
      type: "checkout.session.completed",
      livemode: typeof session.livemode === "boolean" ? session.livemode : null,
      object: {
        id: session.id || sessionId,
        object: "checkout.session",
        payment_status: "paid",
        livemode: session.livemode,
        amount_total: session.amount_total,
        currency: session.currency,
        client_reference_id: bill.id,
        metadata: { bill_id: bill.id, kidease: "bill" },
        payment_intent: session.payment_intent,
      },
    });
    const row = await loadInvoice(sql, bill.id);
    return row ? mapBill(row) : bill;
  } catch (err) {
    console.error("[kidease-bill] checkout reconcile skipped", err instanceof Error ? err.message : "failed");
    return bill;
  }
}

export const createBillCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: string | { billId?: string; locale?: string | null }) => {
    if (typeof input === "string") return { billId: input, locale: null as "en" | "fr" | null };
    return {
      billId: String(input?.billId || "").trim(),
      locale: normalizeCheckoutLocale(input?.locale),
    };
  })
  .handler(async ({ context, data }) => {
    const billId = data.billId;
    const sql = await getSql();
    const row = await loadInvoice(sql, billId);
    const bill = row ? mapBill(row) : null;
    const mode: PaymentStripeMode = bill ? await billStripeMode(sql, bill) : "live";
    const qa = mode === "test";
    const creds = stripeCredentialsForMode(mode, process.env);
    const qaSecret = qa && creds.ok && !creds.secret.startsWith("sk_live_") ? creds.secret : null;
    if (qa && !qaSecret) throw new Error("missing_test_key");
    const gate = decideBillCheckout({
      actorUserId: context.userId,
      bill: bill ? { parentUserId: bill.parentUserId, status: bill.status } : null,
      stripeLive: qa || parentBillCardLive(),
    });
    if (!gate.ok) throw new Error(gate.error);
    if (gate.alreadyPaid) return { url: null as string | null, alreadyPaid: true as const };
    if (!bill) throw new Error("Bill not found");
    // The old-session check (a Stripe round trip), the Connect row and the
    // payer profile are independent: run them together (Pay now speed).
    const [settled, connect, profile] = await Promise.all([
      reconcilePaidCheckout(sql, bill, { mode }),
      sql<{ stripe_account_id: string | null; charges_enabled: number }>`
        select stripe_account_id, charges_enabled from stripe_accounts where daycare_id = ${bill.daycareId} limit 1
      `.catch(() => []),
      sql<{ stripe_customer_id: string | null; locale: string | null }>`
        select stripe_customer_id, locale from profiles where user_id = ${context.userId} limit 1
      `.catch(() => []),
    ]);
    if (settled?.status === "paid") return { url: null as string | null, alreadyPaid: true as const };
    if (!creds.ok) throw new Error(creds.reason);
    const destination = resolveConnectDestination({
      stripeAccountId: connect[0]?.stripe_account_id,
      chargesEnabled: connect[0]?.charges_enabled,
    });
    const quote = quoteShownOnPayPage(
      parentChargeQuote({
        invoiceCents: bill.amountCents,
        province: row?.province,
        daycareId: bill.daycareId,
      }),
      Boolean(destination),
    );
    const origin = appOrigin();
    const locale = data.locale ?? (normalizeCheckoutLocale(profile[0]?.locale) ?? "en");
    const session = await createStripeCheckoutSession({
      billId: bill.id,
      number: bill.number,
      amountCents: bill.amountCents,
      currency: bill.currency,
      period: bill.period,
      daycareName: bill.daycareName,
      successUrl: `${origin}/pay/bill/${bill.id}?paid=1`,
      cancelUrl: `${origin}/pay/bill/${bill.id}`,
      customerId: qa ? null : profile[0]?.stripe_customer_id ?? null,
      customerEmail: bill.parentEmail,
      userId: context.userId,
      locale,
      secret: qaSecret ?? undefined,
      qa,
      destinationAccount: destination,
      applicationFeeCents: destination ? quote.applicationFeeCents : undefined,
      serviceFeeLabel: quote.label,
    });
    if (!qa) await rememberStripeCustomer(context.userId, session.customer ?? null);
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
    // Record what this Checkout actually takes from the payout: the KidEase fee
    // only applies with a Connect destination (otherwise nothing is deducted).
    const appliedFee = destination ? quote.applicationFeeCents : 0;
    await sql`
      update invoices set
        stripe_checkout_session_id = ${session.id},
        stripe_payment_intent_id = coalesce(${pi}, stripe_payment_intent_id),
        platform_fee_cents = ${appliedFee},
        net_cents = ${bill.amountCents - appliedFee},
        updated_at = now()
      where id = ${bill.id}
    `;
    if (!session.url) throw new Error("Stripe did not return a Pay link");
    return { url: session.url, alreadyPaid: false as const };
  });
