/**
 * Connect charges, wallet SetupIntents, and embedded account sessions.
 * No-ops unless the flag is on and the secret is an sk_test_ key.
 * Never returns a hosted invoice URL or a secret key.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import {
  accountSessionBody,
  applicationFeeCents,
  classifyConnectEvent,
  connectChargeGate,
  connectFeeBps,
  connectedAccountBody,
  destinationChargeFields,
  feeTaxPlan,
  appendMonthlyFeeTax,
  isEarlierPeriod,
  monthlyFeeTaxInvoiceBody,
  monthlyFeeTaxLine,
  parentInvoiceBody,
  parentInvoiceLine,
  parsePayMode,
  publicConnectState,
  shapeWalletMethod,
  stripeTaxCalculationBody,
  walletSetupIntentBody,
  withoutHostedInvoice,
  type ConnectEventAction,
  type PayMode,
  type WalletMethodView,
} from "@/lib/connect-payments";
import { ensureCanadaStripeCustomer, stripeRequest } from "@/lib/server/stripe-checkout";

type Sql = Awaited<ReturnType<typeof getSql>>;

function gate() {
  return connectChargeGate();
}

export const connectPaymentsPublic = createServerFn({ method: "GET" }).handler(async () => {
  return publicConnectState();
});

async function profileCustomer(sql: Sql, userId: string): Promise<{ customerId: string | null; email: string | null }> {
  const rows = await sql<{ stripe_customer_id: string | null; email: string | null }>`
    select p.stripe_customer_id, u.email
    from "user" u
    left join profiles p on p.user_id = u.id
    where u.id = ${userId}
    limit 1
  `.catch(() => []);
  return { customerId: rows[0]?.stripe_customer_id ?? null, email: rows[0]?.email ?? null };
}

async function defaultPaymentMethod(customerId: string): Promise<string | null> {
  const customer = await stripeRequest<{ invoice_settings?: { default_payment_method?: string | { id?: string } | null } }>(
    `/customers/${encodeURIComponent(customerId)}`,
    {},
    "GET",
  );
  const value = customer.invoice_settings?.default_payment_method;
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
}

async function listStripeMethods(customerId: string, defaultId: string | null): Promise<WalletMethodView[]> {
  const out: WalletMethodView[] = [];
  for (const type of ["card", "acss_debit"] as const) {
    const page = await stripeRequest<{ data?: Array<Parameters<typeof shapeWalletMethod>[0]> }>(
      "/payment_methods",
      { customer: customerId, type, limit: 20 },
      "GET",
    );
    for (const row of page.data || []) {
      const shaped = shapeWalletMethod(row, defaultId);
      if (shaped) out.push(shaped);
    }
  }
  return out;
}

export const listWalletMethods = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const check = gate();
    if (!check.ok) return { ok: false as const, reason: check.reason, methods: [] as WalletMethodView[] };
    const sql = await getSql();
    const profile = await profileCustomer(sql, context.userId);
    if (!profile.customerId) return { ok: true as const, methods: [] as WalletMethodView[] };
    const fallback = await defaultPaymentMethod(profile.customerId).catch(() => null);
    const methods = await listStripeMethods(profile.customerId, fallback);
    return { ok: true as const, methods };
  });

export const createWalletSetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const check = gate();
    if (!check.ok) return { ok: false as const, reason: check.reason, clientSecret: null as string | null };
    const sql = await getSql();
    const profile = await profileCustomer(sql, context.userId);
    const customerId = await ensureCanadaStripeCustomer({
      customerId: profile.customerId,
      email: profile.email,
      userId: context.userId,
    });
    const intent = await stripeRequest<{ client_secret?: string | null }>("/setup_intents", {
      ...walletSetupIntentBody(),
      customer: customerId,
      metadata: { kidease: "wallet", user_id: context.userId },
    }, "POST", { idempotencyKey: `wallet-setup-${context.userId}-${nid("set")}` });
    const clientSecret = String(intent.client_secret || "");
    if (!clientSecret) return { ok: false as const, reason: "missing" as const, clientSecret: null };
    return { ok: true as const, clientSecret };
  });

export const updateWalletMethod = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paymentMethodId?: string; nickname?: string; expMonth?: number; expYear?: number; makeDefault?: boolean }) => {
    const paymentMethodId = String(input?.paymentMethodId || "").trim();
    if (!paymentMethodId.startsWith("pm_")) throw new Error("Payment method required");
    const nickname = String(input?.nickname || "").trim().slice(0, 40);
    const expMonth = Number(input?.expMonth);
    const expYear = Number(input?.expYear);
    return {
      paymentMethodId,
      nickname,
      expMonth: Number.isFinite(expMonth) ? expMonth : null,
      expYear: Number.isFinite(expYear) ? expYear : null,
      makeDefault: input?.makeDefault === true,
    };
  })
  .handler(async ({ context, data }) => {
    const check = gate();
    if (!check.ok) return { ok: false as const, reason: check.reason };
    const sql = await getSql();
    const profile = await profileCustomer(sql, context.userId);
    if (!profile.customerId) return { ok: false as const, reason: "missing" as const };
    const owned = await stripeRequest<{ customer?: string | null }>(
      `/payment_methods/${encodeURIComponent(data.paymentMethodId)}`,
      {},
      "GET",
    );
    if (owned.customer !== profile.customerId) return { ok: false as const, reason: "missing" as const };
    const body: Record<string, unknown> = {};
    if (data.nickname) body.metadata = { nickname: data.nickname };
    if (data.expMonth && data.expYear && data.expMonth >= 1 && data.expMonth <= 12 && data.expYear >= 2024) {
      body.card = { exp_month: data.expMonth, exp_year: data.expYear };
    }
    if (Object.keys(body).length) {
      await stripeRequest(`/payment_methods/${encodeURIComponent(data.paymentMethodId)}`, body);
    }
    if (data.makeDefault) {
      await stripeRequest(`/customers/${encodeURIComponent(profile.customerId)}`, {
        invoice_settings: { default_payment_method: data.paymentMethodId },
      });
    }
    return { ok: true as const };
  });

export const removeWalletMethod = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((paymentMethodId: string) => {
    const id = String(paymentMethodId || "").trim();
    if (!id.startsWith("pm_")) throw new Error("Payment method required");
    return id;
  })
  .handler(async ({ context, data: paymentMethodId }) => {
    const check = gate();
    if (!check.ok) return { ok: false as const, reason: check.reason };
    const sql = await getSql();
    const profile = await profileCustomer(sql, context.userId);
    if (!profile.customerId) return { ok: false as const, reason: "missing" as const };
    const owned = await stripeRequest<{ customer?: string | null }>(
      `/payment_methods/${encodeURIComponent(paymentMethodId)}`,
      {},
      "GET",
    );
    if (owned.customer !== profile.customerId) return { ok: false as const, reason: "missing" as const };
    await stripeRequest(`/payment_methods/${encodeURIComponent(paymentMethodId)}/detach`, {});
    return { ok: true as const };
  });

async function ownsCentre(sql: Sql, userId: string, daycareId: string) {
  const rows = await sql<{ user_id: string }>`
    select user_id from provider_daycares
    where user_id = ${userId} and daycare_id = ${daycareId}
    limit 1
  `.catch(() => []);
  return Boolean(rows[0]);
}

export const createConnectAccountSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => {
    const id = String(daycareId || "").trim();
    if (!id || id.length > 80) throw new Error("Centre required");
    return id;
  })
  .handler(async ({ context, data: daycareId }) => {
    const check = gate();
    if (!check.ok) return { ok: false as const, reason: check.reason, clientSecret: null as string | null };
    const sql = await getSql();
    if (!(await ownsCentre(sql, context.userId, daycareId))) {
      return { ok: false as const, reason: "missing" as const, clientSecret: null };
    }
    const existing = await sql<{ stripe_account_id: string | null }>`
      select stripe_account_id from stripe_accounts where daycare_id = ${daycareId} limit 1
    `.catch(() => []);
    let accountId = String(existing[0]?.stripe_account_id || "");
    if (!accountId.startsWith("acct_")) {
      const created = await stripeRequest<{ id?: string }>("/accounts", connectedAccountBody(), "POST", {
        idempotencyKey: `connect-acct-${daycareId}`,
      });
      accountId = String(created.id || "");
      if (!accountId.startsWith("acct_")) return { ok: false as const, reason: "missing" as const, clientSecret: null };
      await sql`
        insert into stripe_accounts (daycare_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
        values (${daycareId}, ${accountId}, 0, 0, 0)
        on conflict (daycare_id) do update set stripe_account_id = ${accountId}, updated_at = now()
      `.catch(() => undefined);
    }
    const session = await stripeRequest<{ client_secret?: string }>("/account_sessions", accountSessionBody(accountId), "POST", {
      idempotencyKey: `connect-session-${accountId}-${nid("as")}`,
    });
    const clientSecret = String(session.client_secret || "");
    if (!clientSecret) return { ok: false as const, reason: "missing" as const, clientSecret: null };
    return { ok: true as const, clientSecret };
  });

export const listCentreIdsForPayouts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const state = publicConnectState();
    if (!state.enabled) return { enabled: false as const, ready: false, blockedLive: false, centres: [] as { id: string; name: string }[] };
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string }>`
      select d.id, d.name
      from provider_daycares p
      join daycares d on d.id = p.daycare_id
      where p.user_id = ${context.userId}
      order by d.name
      limit 12
    `.catch(() => []);
    return { ...state, centres: rows };
  });

type OpenBill = { id: string; daycareId: string; daycareName: string; amountCents: number; number: string };

export const listParentPayChoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const state = publicConnectState();
    if (!state.enabled) {
      return { enabled: false as const, ready: false, blockedLive: false, modes: [] as { daycareId: string; daycareName: string; mode: PayMode }[], open: [] as OpenBill[] };
    }
    const sql = await getSql();
    const centres = await sql<{ daycare_id: string; name: string; mode: string | null }>`
      select distinct i.daycare_id, d.name, pref.mode
      from invoices i
      join daycares d on d.id = i.daycare_id
      left join parent_pay_prefs pref on pref.parent_user_id = i.parent_user_id and pref.daycare_id = i.daycare_id
      where i.parent_user_id = ${context.userId}
      order by d.name
      limit 40
    `.catch(() => []);
    const openRows = await sql<{ id: string; daycare_id: string; name: string; amount_cents: number | null; total: number; number: string }>`
      select i.id, i.daycare_id, d.name, i.amount_cents, i.total, i.number
      from invoices i
      join daycares d on d.id = i.daycare_id
      where i.parent_user_id = ${context.userId} and i.status = 'sent'
      order by i.created_at desc
      limit 40
    `.catch(() => []);
    return {
      ...state,
      modes: centres.map((row) => ({
        daycareId: row.daycare_id,
        daycareName: row.name,
        mode: parsePayMode(row.mode),
      })),
      open: openRows.map((row) => ({
        id: row.id,
        daycareId: row.daycare_id,
        daycareName: row.name,
        amountCents: row.amount_cents != null ? Number(row.amount_cents) : Math.round(Number(row.total) || 0) * 100,
        number: row.number,
      })),
    };
  });

export const setParentPayMode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; mode?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    mode: parsePayMode(input?.mode),
  }))
  .handler(async ({ context, data }) => {
    const state = publicConnectState();
    if (!state.enabled) return { ok: false as const, reason: "off" as const };
    if (!data.daycareId) return { ok: false as const, reason: "missing" as const };
    const sql = await getSql();
    const linked = await sql<{ id: string }>`
      select id from invoices
      where parent_user_id = ${context.userId} and daycare_id = ${data.daycareId}
      limit 1
    `.catch(() => []);
    if (!linked[0]) return { ok: false as const, reason: "missing" as const };
    await sql`
      insert into parent_pay_prefs (parent_user_id, daycare_id, mode)
      values (${context.userId}, ${data.daycareId}, ${data.mode})
      on conflict (parent_user_id, daycare_id) do update set mode = ${data.mode}, updated_at = now()
    `;
    return { ok: true as const, mode: data.mode };
  });

async function payModeFor(sql: Sql, parentUserId: string, daycareId: string): Promise<PayMode> {
  const rows = await sql<{ mode: string }>`
    select mode from parent_pay_prefs
    where parent_user_id = ${parentUserId} and daycare_id = ${daycareId}
    limit 1
  `.catch(() => []);
  return parsePayMode(rows[0]?.mode);
}

/** Called when a centre sends a bill. Flag off or a live key: no Stripe call. */
export async function attachConnectBill(billId: string): Promise<{ ok: boolean; reason?: string }> {
  const check = gate();
  if (!check.ok) return { ok: false, reason: check.reason };
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    parent_user_id: string;
    daycare_id: string;
    number: string;
    amount_cents: number | null;
    total: number;
    stripe_invoice_id: string | null;
    status: string;
  }>`
    select id, parent_user_id, daycare_id, number, amount_cents, total, stripe_invoice_id, status
    from invoices where id = ${billId} limit 1
  `.catch(() => []);
  const bill = rows[0];
  if (!bill || bill.status === "paid" || bill.status === "void") return { ok: false, reason: "missing" };
  const connect = await sql<{ stripe_account_id: string | null; charges_enabled: number }>`
    select stripe_account_id, charges_enabled from stripe_accounts where daycare_id = ${bill.daycare_id} limit 1
  `.catch(() => []);
  const destination = String(connect[0]?.stripe_account_id || "");
  if (!destination.startsWith("acct_") || !connect[0]?.charges_enabled) return { ok: false, reason: "missing" };
  const invoiceCents = bill.amount_cents != null ? Number(bill.amount_cents) : Math.round(Number(bill.total) || 0) * 100;
  const fee = applicationFeeCents(invoiceCents, connectFeeBps());
  destinationChargeFields({ invoiceCents, destination, bps: connectFeeBps() });
  const profile = await profileCustomer(sql, bill.parent_user_id);
  const customerId = await ensureCanadaStripeCustomer({
    customerId: profile.customerId,
    email: profile.email,
    userId: bill.parent_user_id,
  });
  const mode = await payModeFor(sql, bill.parent_user_id, bill.daycare_id);
  const fallback = mode === "automatic" ? await defaultPaymentMethod(customerId).catch(() => null) : null;
  if (!bill.stripe_invoice_id) {
    const invoice = await stripeRequest<{ id?: string; payment_intent?: string | { id?: string } | null }>(
      "/invoices",
      parentInvoiceBody({
        mode,
        customerId,
        destination,
        invoiceCents,
        billId: bill.id,
        defaultPaymentMethod: fallback,
        bps: connectFeeBps(),
      }),
      "POST",
      { idempotencyKey: `bill-inv-${bill.id}` },
    );
    const invoiceId = String(invoice.id || "");
    if (invoiceId.startsWith("in_")) {
      await stripeRequest("/invoiceitems", {
        ...parentInvoiceLine(invoiceCents, `Daycare bill ${bill.number}`),
        customer: customerId,
        invoice: invoiceId,
      }, "POST", { idempotencyKey: `bill-item-${bill.id}` });
      const finalized = withoutHostedInvoice(
        await stripeRequest<Record<string, unknown>>(`/invoices/${encodeURIComponent(invoiceId)}/finalize`, {}, "POST", {
          idempotencyKey: `bill-final-${bill.id}`,
        }),
      );
      const pi = finalized.payment_intent;
      const paymentIntentId = typeof pi === "string" ? pi : pi && typeof pi === "object" && "id" in pi ? String((pi as { id?: string }).id || "") : "";
      await sql`
        update invoices set
          stripe_invoice_id = ${invoiceId},
          stripe_payment_intent_id = coalesce(${paymentIntentId || null}, stripe_payment_intent_id),
          platform_fee_cents = ${fee},
          net_cents = ${Math.max(0, invoiceCents - fee)},
          updated_at = now()
        where id = ${bill.id}
      `.catch(() => undefined);
    }
  }
  return { ok: true };
}

export const startManualPay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { billId?: string; paymentMethodId?: string }) => ({
    billId: String(input?.billId || "").trim(),
    paymentMethodId: String(input?.paymentMethodId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    const check = gate();
    if (!check.ok) return { ok: false as const, reason: check.reason, clientSecret: null as string | null };
    if (!data.billId || !data.paymentMethodId.startsWith("pm_")) {
      return { ok: false as const, reason: "missing" as const, clientSecret: null };
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; parent_user_id: string; status: string; stripe_payment_intent_id: string | null }>`
      select id, parent_user_id, status, stripe_payment_intent_id
      from invoices where id = ${data.billId} limit 1
    `.catch(() => []);
    const bill = rows[0];
    if (!bill || bill.parent_user_id !== context.userId || bill.status !== "sent") {
      return { ok: false as const, reason: "missing" as const, clientSecret: null };
    }
    await attachConnectBill(bill.id);
    const fresh = await sql<{ stripe_payment_intent_id: string | null }>`
      select stripe_payment_intent_id from invoices where id = ${bill.id} limit 1
    `.catch(() => []);
    const paymentIntentId = String(fresh[0]?.stripe_payment_intent_id || bill.stripe_payment_intent_id || "");
    if (!paymentIntentId.startsWith("pi_")) return { ok: false as const, reason: "missing" as const, clientSecret: null };
    const profile = await profileCustomer(sql, context.userId);
    if (profile.customerId) {
      const owned = await stripeRequest<{ customer?: string | null }>(
        `/payment_methods/${encodeURIComponent(data.paymentMethodId)}`,
        {},
        "GET",
      );
      if (owned.customer !== profile.customerId) return { ok: false as const, reason: "missing" as const, clientSecret: null };
    }
    const intent = withoutHostedInvoice(
      await stripeRequest<Record<string, unknown>>(`/payment_intents/${encodeURIComponent(paymentIntentId)}`, {}, "GET"),
    );
    const clientSecret = typeof intent.client_secret === "string" ? intent.client_secret : "";
    if (!clientSecret) return { ok: false as const, reason: "missing" as const, clientSecret: null };
    return { ok: true as const, clientSecret, paymentMethodId: data.paymentMethodId };
  });

async function feeTaxCentsFor(feeCents: number): Promise<number | null> {
  const plan = feeTaxPlan();
  const line = monthlyFeeTaxLine({ plan, feeCents });
  if (line) return line.amount;
  if (plan.kind !== "stripe_tax" || feeCents <= 0) return null;
  const calc = await stripeRequest<{ tax_amount_exclusive?: number }>("/tax/calculations", stripeTaxCalculationBody(feeCents));
  return monthlyFeeTaxLine({ plan, feeCents, calculatedTaxCents: calc.tax_amount_exclusive })?.amount ?? null;
}

/** Send last month's draft once this month has started. The current month stays open. */
async function finalizePriorFeeInvoices(sql: Sql, daycareId: string, period: string): Promise<void> {
  const rows = await sql<{ stripe_invoice_id: string | null; period: string; status: string }>`
    select stripe_invoice_id, period, status
    from daycare_fee_invoices
    where daycare_id = ${daycareId} and status = 'draft' and stripe_invoice_id is not null
  `.catch(() => []);
  for (const row of rows) {
    if (!isEarlierPeriod(row.period, period)) continue;
    const invoiceId = String(row.stripe_invoice_id || "");
    if (!invoiceId.startsWith("in_")) continue;
    try {
      await stripeRequest(`/invoices/${encodeURIComponent(invoiceId)}/finalize`, {}, "POST", {
        idempotencyKey: `fee-tax-final-${invoiceId}`,
      });
      await stripeRequest(`/invoices/${encodeURIComponent(invoiceId)}/send`, {}, "POST", {
        idempotencyKey: `fee-tax-send-${invoiceId}`,
      });
      await sql`
        update daycare_fee_invoices set status = 'open'
        where stripe_invoice_id = ${invoiceId} and status = 'draft'
      `.catch(() => undefined);
    } catch (err) {
      console.error("[kidease-connect] monthly fee invoice not sent", err);
    }
  }
}

/**
 * Add this bill's tax to the daycare's draft for the month.
 * The draft is sent when a later month starts. Nothing is charged while the flag is off.
 */
export async function queueMonthlyFeeTax(billId: string): Promise<{ ok: boolean; reason?: string }> {
  const check = gate();
  if (!check.ok) return { ok: false, reason: check.reason };
  if (feeTaxPlan().kind === "none") return { ok: false, reason: "missing" };
  const sql = await getSql();
  const rows = await sql<{
    daycare_id: string;
    period: string;
    platform_fee_cents: number | null;
    status: string;
  }>`
    select daycare_id, period, platform_fee_cents, status from invoices where id = ${billId} limit 1
  `.catch(() => []);
  const bill = rows[0];
  if (!bill || bill.status !== "paid") return { ok: false, reason: "missing" };
  const fee = Number(bill.platform_fee_cents) || 0;
  const tax = await feeTaxCentsFor(fee);
  if (tax == null || tax <= 0) return { ok: false, reason: "missing" };

  const recorded = await sql<{ bill_id: string }>`
    select bill_id from daycare_fee_invoice_lines
    where daycare_id = ${bill.daycare_id} and period = ${bill.period}
  `.catch(() => []);
  const headerRows = await sql<{
    stripe_invoice_id: string | null;
    status: string;
    fee_cents: number | null;
    tax_cents: number | null;
  }>`
    select stripe_invoice_id, status, fee_cents, tax_cents
    from daycare_fee_invoices
    where daycare_id = ${bill.daycare_id} and period = ${bill.period}
    limit 1
  `.catch(() => []);
  const header = headerRows[0];
  const next = appendMonthlyFeeTax({
    recordedBillIds: recorded.map((row) => row.bill_id),
    billId,
    feeCents: fee,
    taxCents: tax,
    priorFeeCents: Number(header?.fee_cents) || 0,
    priorTaxCents: Number(header?.tax_cents) || 0,
  });
  if (!next.record) {
    await finalizePriorFeeInvoices(sql, bill.daycare_id, bill.period);
    return { ok: true };
  }
  if (header && header.status !== "draft") return { ok: false, reason: "closed" };

  const owner = await sql<{ email: string | null; user_id: string }>`
    select u.email, u.id as user_id
    from provider_daycares p
    join "user" u on u.id = p.user_id
    where p.daycare_id = ${bill.daycare_id}
    limit 1
  `.catch(() => []);
  if (!owner[0]) return { ok: false, reason: "missing" };
  const ownerProfile = await profileCustomer(sql, owner[0].user_id);
  const customerId = await ensureCanadaStripeCustomer({
    customerId: ownerProfile.customerId,
    email: owner[0].email,
    userId: owner[0].user_id,
  });
  let invoiceId = String(header?.stripe_invoice_id || "");
  if (!invoiceId.startsWith("in_")) {
    const invoice = await stripeRequest<{ id?: string }>(
      "/invoices",
      monthlyFeeTaxInvoiceBody({ customerId, daycareId: bill.daycare_id, period: bill.period }),
      "POST",
      { idempotencyKey: `fee-tax-${bill.daycare_id}-${bill.period}` },
    );
    invoiceId = String(invoice.id || "");
    if (!invoiceId.startsWith("in_")) return { ok: false, reason: "missing" };
    await sql`
      insert into daycare_fee_invoices (id, daycare_id, period, fee_cents, tax_cents, stripe_invoice_id, status)
      values (${nid("ftax")}, ${bill.daycare_id}, ${bill.period}, 0, 0, ${invoiceId}, 'draft')
      on conflict (daycare_id, period) do nothing
    `.catch(() => undefined);
    const saved = await sql<{ stripe_invoice_id: string | null }>`
      select stripe_invoice_id from daycare_fee_invoices
      where daycare_id = ${bill.daycare_id} and period = ${bill.period}
      limit 1
    `.catch(() => []);
    invoiceId = String(saved[0]?.stripe_invoice_id || invoiceId);
  }
  await stripeRequest("/invoiceitems", {
    customer: customerId,
    invoice: invoiceId,
    amount: tax,
    currency: "cad",
    description: "Tax on KidEase fees",
  }, "POST", { idempotencyKey: `fee-tax-item-${billId}` });
  const inserted = await sql<{ bill_id: string }>`
    insert into daycare_fee_invoice_lines (bill_id, daycare_id, period, fee_cents, tax_cents)
    values (${billId}, ${bill.daycare_id}, ${bill.period}, ${fee}, ${tax})
    on conflict (bill_id) do nothing
    returning bill_id
  `.catch(() => []);
  if (inserted[0]) {
    await sql`
      update daycare_fee_invoices set
        fee_cents = fee_cents + ${fee},
        tax_cents = coalesce(tax_cents, 0) + ${tax}
      where daycare_id = ${bill.daycare_id} and period = ${bill.period}
    `.catch(() => undefined);
  }
  await finalizePriorFeeInvoices(sql, bill.daycare_id, bill.period);
  return { ok: true };
}

export async function applyConnectSideEffect(type: string, object: Record<string, unknown> | null): Promise<ConnectEventAction> {
  const action = classifyConnectEvent(type, object);
  if (action.kind === "ignore" || action.kind === "bill") return action;
  const sql = await getSql();
  if (action.kind === "account") {
    await sql`
      update stripe_accounts set
        charges_enabled = ${action.chargesEnabled ? 1 : 0},
        payouts_enabled = ${action.payoutsEnabled ? 1 : 0},
        details_submitted = ${action.detailsSubmitted ? 1 : 0},
        updated_at = now()
      where stripe_account_id = ${action.accountId}
    `.catch(() => undefined);
  }
  if (action.kind === "payout") {
    await sql`
      update payouts set
        status = 'paid',
        stripe_payout_id = ${action.payoutId},
        paid_at = coalesce(paid_at, now())
      where stripe_payout_id = ${action.payoutId}
    `.catch(() => undefined);
  }
  if (action.kind === "fee_tax") {
    await sql`
      update daycare_fee_invoices set status = ${action.status}
      where stripe_invoice_id = ${action.invoiceId}
    `.catch(() => undefined);
  }
  return action;
}
