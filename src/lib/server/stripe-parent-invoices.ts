/**
 * Store Stripe parent invoices and send the ready / paid / failed notices.
 * Idempotent on the Stripe event id. SMS waits out quiet hours.
 */

import { createServerFn } from "@tanstack/react-start";
import { dbSource, getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { evaluateFeatureFlag } from "@/lib/flags";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { isAddressBlocked, readConsent } from "@/lib/server/casl-consent";
import { sendSms } from "@/lib/server/sms";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { listCentreOwnerEmails } from "@/lib/server/thread-access";
import { nextAlertSendAt } from "@/lib/alert-push";
import { quietHourInZone } from "@/lib/family-time";
import {
  invoiceCustomerEmail,
  invoiceNoticeKey,
  invoiceSmsDecision,
  planParentInvoice,
  unlinkedInvoiceReason,
  type InvoiceLocale,
  type InvoiceParty,
  type ParentInvoiceDraft,
  type ParentInvoicePlan,
  type ParentInvoiceStatus,
  type PlannedInvoiceNotice,
} from "@/lib/stripe-parent-invoice";

export type StripeInvoiceView = {
  id: string;
  number: string;
  amountCents: number | null;
  currency: string;
  status: ParentInvoiceStatus;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  daycareName: string | null;
  viewer: "parent" | "daycare";
};

type InvoiceRow = {
  stripe_invoice_id: string;
  number: string;
  amount_cents: number | null;
  currency: string;
  status: string;
  paid_at: string | Date | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  parent_user_id: string | null;
  daycare_id: string | null;
  customer_email: string | null;
  daycare_name?: string | null;
};

export async function applyParentStripeInvoice(input: {
  eventId?: string | null;
  type: string;
  object: unknown;
  livemode?: boolean;
}): Promise<{
  ok: true;
  duplicate?: boolean;
  ignored?: string;
  invoiceId: string | null;
  parentUserId: string | null;
  unlinked: string | null;
}> {
  const eventId = String(input.eventId || "").trim();
  const type = input.type || "";
  const sql = await getSql();
  const links = await resolveLinks(sql, input.object);
  const peek = planParentInvoice({
    eventId: eventId || "peek",
    type,
    object: input.object,
    links,
    previousStatus: null,
    featureSms: false,
  });
  if (peek.outcome === "ignore") {
    return { ok: true, ignored: peek.reason || type, invoiceId: null, parentUserId: null, unlinked: null };
  }
  const invoiceId = peek.invoice?.stripeInvoiceId || "";
  const customerEmail = peek.invoice?.customerEmail || invoiceCustomerEmail(input.object);
  if (dbSource === "none") {
    logUnlinked(invoiceId, "database_unavailable");
    return {
      ok: true,
      ignored: "database_unavailable",
      invoiceId: invoiceId || null,
      parentUserId: null,
      unlinked: "database_unavailable",
    };
  }

  if (eventId) {
    const claimed = await claimEvent(sql, eventId, type, input.livemode === true);
    if (!claimed) {
      const relinked = await relinkStoredInvoice(sql, invoiceId, links.parentUserId, customerEmail);
      return {
        ok: true,
        duplicate: true,
        invoiceId: invoiceId || null,
        parentUserId: relinked.parentUserId,
        unlinked: relinked.unlinked,
      };
    }
  }

  try {
    const previous = invoiceId ? await previousStatus(sql, invoiceId) : null;
    const parent = await parentParty(sql, links.parentUserId, customerEmail);
    const daycare = await daycareParty(sql, links.daycareId);
    const plan = planParentInvoice({
      eventId: eventId || "peek",
      type,
      object: input.object,
      links,
      previousStatus: previous,
      now: new Date(),
      featureSms: evaluateFeatureFlag("FEATURE_SMS"),
      appOrigin: appOrigin(),
      parent,
      daycare,
    });
    if (plan.outcome === "ignore" || !plan.invoice) {
      return { ok: true, ignored: plan.reason || type, invoiceId: invoiceId || null, parentUserId: null, unlinked: null };
    }
    await upsertInvoice(sql, plan.invoice, input.livemode === true);
    const unlinked = unlinkedInvoiceReason({
      parentUserId: plan.invoice.parentUserId,
      customerEmail: plan.invoice.customerEmail,
    });
    if (unlinked) logUnlinked(plan.invoice.stripeInvoiceId, unlinked);
    await deliverNotices(sql, eventId, plan, daycareOwners(sql, links.daycareId));
    return {
      ok: true,
      invoiceId: plan.invoice.stripeInvoiceId,
      parentUserId: plan.invoice.parentUserId,
      unlinked,
    };
  } catch (err) {
    if (eventId) await releaseEvent(sql, eventId);
    throw err;
  }
}

export async function flushHeldInvoiceSms(opts?: { now?: Date }): Promise<{ sent: number }> {
  const now = opts?.now ?? new Date();
  const sql = await getSql();
  const rows = await sql<{ id: string; user_id: string; body: string }>`
    select id, user_id, body
    from stripe_invoice_sms_holds
    where status = ${"held"} and send_after <= ${now.toISOString()}
    order by send_after asc
    limit 40
  `.catch(() => [] as { id: string; user_id: string; body: string }[]);
  let sent = 0;
  for (const row of rows) {
    const party = await loadParty(sql, row.user_id);
    if (!party) {
      await sql`update stripe_invoice_sms_holds set status = ${"skipped"} where id = ${row.id}`.catch(() => undefined);
      continue;
    }
    const decision = invoiceSmsDecision({
      featureSms: evaluateFeatureFlag("FEATURE_SMS"),
      smsConsent: party.smsConsent,
      caslSmsGranted: party.caslSmsGranted,
      smsBlocked: party.smsBlocked,
      quiet: false,
    });
    if (decision.action !== "send") {
      if (decision.action === "hold") continue;
      await sql`update stripe_invoice_sms_holds set status = ${"skipped"} where id = ${row.id}`.catch(() => undefined);
      continue;
    }
    const phone = party.phone || "";
    const result = await sendSms({ to: phone, body: row.body, audience: "user", consentGranted: true });
    if (!result.ok && result.skipped === false) continue;
    await sql`update stripe_invoice_sms_holds set status = ${"sent"} where id = ${row.id}`.catch(() => undefined);
    if (result.ok) sent += 1;
  }
  return { sent };
}

export async function loadInvoiceForDownload(
  userId: string,
  invoiceId: string,
): Promise<{ authorized: boolean; invoice: (StripeInvoiceView & { invoicePdf: string | null }) | null }> {
  const sql = await getSql();
  const row = await loadRow(sql, invoiceId);
  if (!row) return { authorized: true, invoice: null };
  const allowed = await canRead(sql, userId, row);
  if (!allowed) return { authorized: false, invoice: null };
  return { authorized: true, invoice: toView(row, userId) };
}

export const listMyStripeInvoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ invoices: StripeInvoiceView[] }> => {
    const sql = await getSql();
    const daycareIds = await listAccessibleDaycareIds(sql, context.userId);
    const params: unknown[] = [context.userId];
    let daycareClause = "false";
    if (daycareIds.length) {
      const marks = daycareIds.map((id, index) => {
        params.push(id);
        return `$${index + 2}`;
      });
      daycareClause = `i.daycare_id in (${marks.join(", ")})`;
    }
    const rows = await sql
      .query<InvoiceRow>(
        `select i.stripe_invoice_id, i.number, i.amount_cents, i.currency, i.status, i.paid_at,
                i.hosted_invoice_url, i.invoice_pdf, i.parent_user_id, i.daycare_id, i.customer_email,
                d.name as daycare_name
         from stripe_parent_invoices i
         left join daycares d on d.id = i.daycare_id
         where i.parent_user_id = $1 or ${daycareClause}
         order by i.created_at desc
         limit 100`,
        params,
      )
      .catch(() => [] as InvoiceRow[]);
    return { invoices: rows.map((row) => toView(row, context.userId)) };
  });

export const getMyStripeInvoice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((invoiceId: string) => String(invoiceId || "").slice(0, 80))
  .handler(async ({ context, data: invoiceId }): Promise<{ invoice: StripeInvoiceView | null }> => {
    const loaded = await loadInvoiceForDownload(context.userId, invoiceId);
    if (!loaded.authorized) return { invoice: null };
    return { invoice: loaded.invoice };
  });

async function claimEvent(sql: Sql, id: string, type: string, livemode: boolean): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    insert into stripe_webhook_events (id, type, livemode)
    values (${id}, ${type}, ${livemode})
    on conflict (id) do nothing
    returning id
  `;
  return rows.length > 0;
}

async function releaseEvent(sql: Sql, id: string): Promise<void> {
  await sql`delete from stripe_webhook_events where id = ${id}`.catch(() => undefined);
}

async function previousStatus(sql: Sql, id: string): Promise<ParentInvoiceStatus | null> {
  const rows = await sql<{ status: string }>`
    select status from stripe_parent_invoices where stripe_invoice_id = ${id} limit 1
  `.catch(() => [] as { status: string }[]);
  const status = rows[0]?.status;
  if (status === "open" || status === "paid" || status === "failed") return status;
  return null;
}

async function upsertInvoice(sql: Sql, invoice: ParentInvoiceDraft, livemode: boolean): Promise<void> {
  await sql`
    insert into stripe_parent_invoices (
      stripe_invoice_id, number, amount_cents, currency, status, paid_at,
      hosted_invoice_url, invoice_pdf, parent_user_id, daycare_id, customer_email, livemode, updated_at
    ) values (
      ${invoice.stripeInvoiceId},
      ${invoice.number},
      ${invoice.amountCents},
      ${invoice.currency},
      ${invoice.status},
      ${invoice.paidAt},
      ${invoice.hostedInvoiceUrl},
      ${invoice.invoicePdf},
      ${invoice.parentUserId},
      ${invoice.daycareId},
      ${invoice.customerEmail},
      ${livemode},
      now()
    )
    on conflict (stripe_invoice_id) do update set
      number = excluded.number,
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      status = excluded.status,
      paid_at = coalesce(stripe_parent_invoices.paid_at, excluded.paid_at),
      hosted_invoice_url = coalesce(excluded.hosted_invoice_url, stripe_parent_invoices.hosted_invoice_url),
      invoice_pdf = coalesce(excluded.invoice_pdf, stripe_parent_invoices.invoice_pdf),
      parent_user_id = coalesce(excluded.parent_user_id, stripe_parent_invoices.parent_user_id),
      daycare_id = coalesce(excluded.daycare_id, stripe_parent_invoices.daycare_id),
      customer_email = coalesce(excluded.customer_email, stripe_parent_invoices.customer_email),
      livemode = excluded.livemode,
      updated_at = now()
  `;
}

async function deliverNotices(
  sql: Sql,
  eventId: string,
  plan: ParentInvoicePlan,
  extraDaycare: Promise<Array<{ userId: string; email: string }>>,
): Promise<void> {
  const owners = await extraDaycare;
  const notices = [...plan.notices];
  const daycareEmail = plan.notices.find((notice) => notice.audience === "daycare" && notice.channel === "email");
  const daycareSms = plan.notices.find((notice) => notice.audience === "daycare" && notice.channel === "sms");
  if (daycareEmail && owners.length > 1) {
    for (const owner of owners.slice(1)) {
      if (!owner.email || owner.email === daycareEmail.to) continue;
      notices.push({ ...daycareEmail, to: owner.email, userId: owner.userId });
    }
  }
  for (const notice of notices) {
    if (notice.channel === "email" && notice.to && notice.subject && notice.text && notice.html) {
      await sendEmailOnce(sql, eventId, notice);
    }
  }
  for (const notice of notices) {
    if (notice.channel !== "sms" || !notice.userId || !notice.smsBody) continue;
    if (notice.smsAction === "hold") {
      await holdSms(sql, eventId, notice.userId, notice.smsBody, notice.sendAfter || new Date().toISOString());
      continue;
    }
    if (notice.smsAction !== "send") continue;
    await sendSmsOnce(sql, eventId, notice);
  }
  if (daycareSms?.smsBody && daycareSms.smsAction !== "none") {
    for (const owner of owners.slice(1)) {
      const party = await loadParty(sql, owner.userId);
      if (!party) continue;
      const decision = invoiceSmsDecision({
        featureSms: evaluateFeatureFlag("FEATURE_SMS"),
        smsConsent: party.smsConsent,
        caslSmsGranted: party.caslSmsGranted,
        smsBlocked: party.smsBlocked,
        quiet: quietHourInZone(new Date(), party.timeZone),
      });
      if (decision.action === "hold") {
        await holdSms(
          sql,
          eventId,
          owner.userId,
          daycareSms.smsBody,
          nextAlertSendAt(new Date(), party.timeZone).toISOString(),
        );
      } else if (decision.action === "send") {
        await sendSmsOnce(sql, eventId, { ...daycareSms, userId: owner.userId, smsAction: "send" });
      }
    }
  }
}

async function sendEmailOnce(sql: Sql, eventId: string, notice: PlannedInvoiceNotice): Promise<void> {
  const address = notice.to || "";
  const key = invoiceNoticeKey(eventId || notice.subject || "mail", notice.audience, "email", address);
  if (eventId && !(await takeNotice(sql, key, eventId))) return;
  try {
    await sendTransactionalMail({
      to: address,
      purpose: "parent_invoice",
      subject: notice.subject || "KidEase",
      text: notice.text || "",
      html: notice.html || "",
    });
  } catch (err) {
    if (eventId) await sql`delete from stripe_invoice_notices where id = ${key}`.catch(() => undefined);
    throw err;
  }
}

async function sendSmsOnce(sql: Sql, eventId: string, notice: PlannedInvoiceNotice): Promise<void> {
  if (!notice.userId || !notice.smsBody) return;
  const key = invoiceNoticeKey(eventId || "sms", notice.audience, "sms", notice.userId);
  if (eventId && !(await takeNotice(sql, key, eventId))) return;
  const phone = await phoneFor(sql, notice.userId);
  const result = await sendSms({
    to: phone,
    body: notice.smsBody,
    audience: "user",
    consentGranted: true,
  });
  if (!result.ok && result.skipped === false) {
    if (eventId) await sql`delete from stripe_invoice_notices where id = ${key}`.catch(() => undefined);
    throw new Error("invoice sms failed");
  }
}

async function holdSms(sql: Sql, eventId: string, userId: string, body: string, sendAfter: string): Promise<void> {
  const id = `${eventId}:${userId}`.slice(0, 200);
  await sql`
    insert into stripe_invoice_sms_holds (id, event_id, user_id, body, send_after, status)
    values (${id}, ${eventId}, ${userId}, ${body}, ${sendAfter}, ${"held"})
    on conflict (event_id, user_id) do nothing
  `.catch(() => undefined);
}

async function takeNotice(sql: Sql, id: string, eventId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    insert into stripe_invoice_notices (id, event_id)
    values (${id}, ${eventId})
    on conflict (id) do nothing
    returning id
  `;
  return rows.length > 0;
}

async function daycareOwners(sql: Sql, daycareId: string | null): Promise<Array<{ userId: string; email: string }>> {
  if (!daycareId) return [];
  const owners = await listCentreOwnerEmails(sql, daycareId);
  return owners
    .filter((owner) => owner.userId && owner.email)
    .map((owner) => ({ userId: owner.userId || "", email: owner.email.toLowerCase() }));
}

async function parentParty(sql: Sql, userId: string | null, customerEmail: string | null): Promise<InvoiceParty | null> {
  if (userId) return loadParty(sql, userId);
  if (!customerEmail) return null;
  return {
    userId: null,
    email: customerEmail,
    locale: "en",
    timeZone: null,
    smsConsent: false,
    caslSmsGranted: false,
    smsBlocked: false,
  };
}

async function daycareParty(sql: Sql, daycareId: string | null): Promise<InvoiceParty | null> {
  const owners = await daycareOwners(sql, daycareId);
  const first = owners[0];
  if (!first) return null;
  return loadParty(sql, first.userId);
}

type PartyRow = InvoiceParty & { phone: string | null };

async function loadParty(sql: Sql, userId: string): Promise<PartyRow | null> {
  const rows = await sql<{
    email: string | null;
    locale: string | null;
    locale_chosen: boolean | number | null;
    time_zone: string | null;
    sms_consent: boolean | number | null;
    phone: string | null;
  }>`
    select u.email, p.locale, p.locale_chosen, p.time_zone, p.sms_consent, p.phone
    from "user" u
    left join profiles p on p.user_id = u.id
    where u.id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row) return null;
  const casl = await readConsent(userId, "sms", "service");
  const phone = row.phone || "";
  const blocked = phone ? await isAddressBlocked("sms", phone, "service") : false;
  const chosen = row.locale_chosen === true || row.locale_chosen === 1;
  const locale: InvoiceLocale = chosen && row.locale === "fr" ? "fr" : "en";
  return {
    userId,
    email: row.email,
    locale,
    timeZone: row.time_zone,
    smsConsent: row.sms_consent === true || row.sms_consent === 1,
    caslSmsGranted: casl.granted === true,
    smsBlocked: blocked,
    phone,
  };
}

async function phoneFor(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ phone: string | null }>`
    select phone from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as { phone: string | null }[]);
  return rows[0]?.phone || "";
}

async function resolveLinks(
  sql: Sql,
  object: unknown,
): Promise<{ parentUserId: string | null; daycareId: string | null }> {
  const row = asRecord(object);
  const meta = asRecord(row?.metadata) ?? {};
  let parentUserId = clean(meta.parent_user_id) || clean(meta.parentUserId);
  let daycareId = clean(meta.daycare_id) || clean(meta.daycareId);
  const billId = clean(meta.bill_id) || clean(meta.billId);
  if (billId && (!parentUserId || !daycareId)) {
    const bills = await sql<{ parent_user_id: string | null; daycare_id: string | null }>`
      select parent_user_id, daycare_id from invoices where id = ${billId} limit 1
    `.catch(() => [] as { parent_user_id: string | null; daycare_id: string | null }[]);
    parentUserId = parentUserId || bills[0]?.parent_user_id || "";
    daycareId = daycareId || bills[0]?.daycare_id || "";
  }
  const email = invoiceCustomerEmail(object);
  if (!parentUserId && email) {
    const users = await sql<{ id: string }>`
      select id from "user" where lower(btrim(email)) = ${email} limit 1
    `.catch(() => [] as { id: string }[]);
    parentUserId = users[0]?.id || "";
  }
  if (!daycareId) {
    const account = connectAccount(row);
    if (account) {
      const accounts = await sql<{ daycare_id: string }>`
        select daycare_id from stripe_accounts where stripe_account_id = ${account} limit 1
      `.catch(() => [] as { daycare_id: string }[]);
      daycareId = accounts[0]?.daycare_id || "";
    }
  }
  return { parentUserId: parentUserId || null, daycareId: daycareId || null };
}

function connectAccount(row: Record<string, unknown> | null): string {
  if (!row) return "";
  const direct = clean(row.on_behalf_of) || clean(row.account);
  if (direct.startsWith("acct_")) return direct;
  const transfer = asRecord(row.transfer_data);
  const destination = clean(transfer?.destination);
  return destination.startsWith("acct_") ? destination : "";
}

async function loadRow(sql: Sql, invoiceId: string): Promise<InvoiceRow | null> {
  const rows = await sql<InvoiceRow>`
    select i.stripe_invoice_id, i.number, i.amount_cents, i.currency, i.status, i.paid_at,
           i.hosted_invoice_url, i.invoice_pdf, i.parent_user_id, i.daycare_id, i.customer_email,
           d.name as daycare_name
    from stripe_parent_invoices i
    left join daycares d on d.id = i.daycare_id
    where i.stripe_invoice_id = ${invoiceId}
    limit 1
  `.catch(() => [] as InvoiceRow[]);
  return rows[0] ?? null;
}

async function canRead(sql: Sql, userId: string, row: InvoiceRow): Promise<boolean> {
  if (row.parent_user_id && row.parent_user_id === userId) return true;
  if (!row.daycare_id) return false;
  const ids = await listAccessibleDaycareIds(sql, userId);
  return ids.includes(row.daycare_id);
}

function toView(row: InvoiceRow, userId: string): StripeInvoiceView {
  const status: ParentInvoiceStatus = row.status === "paid" || row.status === "failed" ? row.status : "open";
  const paidAt = row.paid_at instanceof Date ? row.paid_at.toISOString() : row.paid_at;
  return {
    id: row.stripe_invoice_id,
    number: row.number,
    amountCents: row.amount_cents,
    currency: row.currency || "cad",
    status,
    paidAt: paidAt || null,
    hostedInvoiceUrl: row.hosted_invoice_url,
    invoicePdf: row.invoice_pdf,
    daycareName: row.daycare_name || null,
    viewer: row.parent_user_id === userId ? "parent" : "daycare",
  };
}

function appOrigin(): string {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logUnlinked(invoiceId: string, reason: string): void {
  console.info(`[kidease-invoice] unlinked invoice ${invoiceId || "unknown"}: ${reason}`);
}

/** A repeat of the same event can attach a parent once the email matches. Notices stay idempotent. */
async function relinkStoredInvoice(
  sql: Sql,
  invoiceId: string,
  parentUserId: string | null,
  customerEmail: string | null,
): Promise<{ parentUserId: string | null; unlinked: string | null }> {
  if (!invoiceId) {
    const unlinked = unlinkedInvoiceReason({ parentUserId, customerEmail });
    if (unlinked) logUnlinked(invoiceId, unlinked);
    return { parentUserId, unlinked };
  }
  const existing = await loadRow(sql, invoiceId);
  const already = existing?.parent_user_id || null;
  if (already) return { parentUserId: already, unlinked: null };
  if (parentUserId) {
    await sql`
      update stripe_parent_invoices
      set parent_user_id = ${parentUserId},
          customer_email = coalesce(${customerEmail}, customer_email),
          updated_at = now()
      where stripe_invoice_id = ${invoiceId} and parent_user_id is null
    `.catch(() => undefined);
    return { parentUserId, unlinked: null };
  }
  const unlinked = unlinkedInvoiceReason({ parentUserId: null, customerEmail: existing?.customer_email || customerEmail });
  if (unlinked) logUnlinked(invoiceId, unlinked);
  return { parentUserId: null, unlinked };
}
