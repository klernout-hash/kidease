/**
 * Parent ↔ daycare Stripe invoice events.
 * Pure: no database, no secrets. scripts/stripe-invoices.test.mjs loads this.
 *
 * invoice.finalized emails the parent a pay link and a PDF link, and texts
 * them only with stored CASL SMS consent. invoice.paid emails and texts both
 * sides. invoice.payment_failed notifies the parent. SMS also needs
 * FEATURE_SMS and stays quiet from 21:00 to 08:00 in that person's time zone.
 */

import { nextAlertSendAt } from "./alert-push.ts";
import { quietHourInZone } from "./family-time.ts";

export type InvoiceLocale = "en" | "fr";
export type ParentInvoiceStatus = "open" | "paid" | "failed";
export type ParentInvoiceEventType = "invoice.finalized" | "invoice.paid" | "invoice.payment_failed";

export type InvoiceParty = {
  userId: string | null;
  email: string | null;
  locale: InvoiceLocale;
  timeZone: string | null;
  /** Profile checkbox. Not enough on its own. */
  smsConsent: boolean;
  /** casl_consents sms/service grant. */
  caslSmsGranted: boolean;
  smsBlocked: boolean;
};

export type ParentInvoiceDraft = {
  stripeInvoiceId: string;
  number: string;
  amountCents: number | null;
  currency: string;
  status: ParentInvoiceStatus;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  parentUserId: string | null;
  daycareId: string | null;
  customerEmail: string | null;
};

export type InvoiceSmsAction = "send" | "hold" | "skip" | "none";

export type PlannedInvoiceNotice = {
  audience: "parent" | "daycare";
  channel: "email" | "sms";
  to: string | null;
  userId: string | null;
  locale: InvoiceLocale;
  subject?: string;
  text?: string;
  html?: string;
  smsBody?: string;
  smsAction: InvoiceSmsAction;
  smsReason?: string;
  sendAfter?: string;
};

export type ParentInvoicePlan = {
  outcome: "ignore" | "duplicate" | "apply";
  reason?: string;
  invoice: ParentInvoiceDraft | null;
  notices: PlannedInvoiceNotice[];
};

export function invoiceNoticeKey(eventId: string, audience: string, channel: string, address: string): string {
  return `${eventId}:${audience}:${channel}:${address.trim().toLowerCase()}`.slice(0, 240);
}

export function rememberStripeEventId(seen: Set<string>, eventId: string): boolean {
  const id = eventId.trim();
  if (!id) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
}

export function invoiceSmsDecision(input: {
  featureSms: boolean;
  smsConsent: boolean;
  caslSmsGranted: boolean;
  smsBlocked: boolean;
  quiet: boolean;
}): { action: "send" } | { action: "hold" } | { action: "skip"; reason: string } {
  if (!input.featureSms) return { action: "skip", reason: "feature_off" };
  if (input.smsBlocked) return { action: "skip", reason: "blocked" };
  if (!input.caslSmsGranted) {
    return { action: "skip", reason: input.smsConsent ? "checkbox_without_casl" : "no_consent" };
  }
  if (input.quiet) return { action: "hold" };
  return { action: "send" };
}

export function invoiceStatusLabel(status: ParentInvoiceStatus, locale: InvoiceLocale): string {
  if (locale === "fr") {
    if (status === "paid") return "Payée";
    if (status === "failed") return "Échouée";
    return "Ouverte";
  }
  if (status === "paid") return "Paid";
  if (status === "failed") return "Failed";
  return "Open";
}

export function formatInvoiceMoney(cents: number | null, currency: string, locale: InvoiceLocale): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  const code = /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : "CAD";
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: code,
  }).format(cents / 100);
}

export function invoiceAppPath(id: string, locale: InvoiceLocale): string {
  const safe = encodeURIComponent(id);
  return locale === "fr" ? `/fr/invoices/${safe}` : `/invoices/${safe}`;
}

export function planParentInvoice(input: {
  eventId: string;
  type: string;
  object: unknown;
  seenEventIds?: ReadonlySet<string>;
  now?: Date;
  featureSms?: boolean;
  appOrigin?: string;
  previousStatus?: ParentInvoiceStatus | null;
  links?: { parentUserId?: string | null; daycareId?: string | null };
  parent?: InvoiceParty | null;
  daycare?: InvoiceParty | null;
}): ParentInvoicePlan {
  const eventId = String(input.eventId || "").trim();
  const seen = input.seenEventIds;
  if (eventId && seen?.has(eventId)) {
    return { outcome: "duplicate", reason: "event_id", invoice: null, notices: [] };
  }

  const parsed = parseInvoiceObject(input.object, input.links);
  if (!parsed) return { outcome: "ignore", reason: "not_invoice", invoice: null, notices: [] };
  if (parsed.skip) return { outcome: "ignore", reason: parsed.skip, invoice: null, notices: [] };

  const type = input.type;
  if (type !== "invoice.finalized" && type !== "invoice.paid" && type !== "invoice.payment_failed") {
    return { outcome: "ignore", reason: "type", invoice: null, notices: [] };
  }

  const previous = input.previousStatus ?? null;
  const next = nextStatus(type, previous);
  if (!next) return { outcome: "ignore", reason: "already_paid", invoice: null, notices: [] };

  const now = input.now ?? new Date();
  const invoice: ParentInvoiceDraft = {
    stripeInvoiceId: parsed.id,
    number: parsed.number,
    amountCents: amountFor(parsed, next.status),
    currency: parsed.currency,
    status: next.status,
    paidAt: next.status === "paid" ? parsed.paidAt || now.toISOString() : parsed.paidAt,
    hostedInvoiceUrl: parsed.hostedInvoiceUrl,
    invoicePdf: parsed.invoicePdf,
    parentUserId: parsed.parentUserId,
    daycareId: parsed.daycareId,
    customerEmail: parsed.customerEmail,
  };

  if (!next.notify) return { outcome: "apply", invoice, notices: [] };

  const origin = String(input.appOrigin || "https://www.kidease.ca").replace(/\/$/, "");
  const featureSms = input.featureSms === true;
  const notices: PlannedInvoiceNotice[] = [];
  if (type === "invoice.paid") {
    pushParty(notices, "parent", input.parent ?? null, invoice, origin, now, featureSms, "paid");
    pushParty(notices, "daycare", input.daycare ?? null, invoice, origin, now, featureSms, "paid");
  } else if (type === "invoice.payment_failed") {
    pushParty(notices, "parent", input.parent ?? null, invoice, origin, now, featureSms, "failed");
  } else {
    pushParty(notices, "parent", input.parent ?? null, invoice, origin, now, featureSms, "ready");
  }
  return { outcome: "apply", invoice, notices };
}

type Kind = "ready" | "paid" | "failed";

function pushParty(
  notices: PlannedInvoiceNotice[],
  audience: "parent" | "daycare",
  party: InvoiceParty | null,
  invoice: ParentInvoiceDraft,
  origin: string,
  now: Date,
  featureSms: boolean,
  kind: Kind,
) {
  if (!party) return;
  const locale = party.locale === "fr" ? "fr" : "en";
  const email = cleanEmail(party.email);
  const appUrl = `${origin}${invoiceAppPath(invoice.stripeInvoiceId, locale)}`;
  const money = formatInvoiceMoney(invoice.amountCents, invoice.currency, locale);
  const when = formatWhen(invoice.paidAt, locale, now);
  if (email) {
    const copy = emailCopy({ kind, locale, number: invoice.number, money, when, appUrl, payUrl: invoice.hostedInvoiceUrl, pdfUrl: invoice.invoicePdf });
    notices.push({
      audience,
      channel: "email",
      to: email,
      userId: party.userId,
      locale,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      smsAction: "none",
    });
  }
  const sms = invoiceSmsDecision({
    featureSms,
    smsConsent: party.smsConsent,
    caslSmsGranted: party.caslSmsGranted,
    smsBlocked: party.smsBlocked,
    quiet: quietHourInZone(now, party.timeZone),
  });
  const body = smsBody({ kind, locale, number: invoice.number, money, when, appUrl, payUrl: invoice.hostedInvoiceUrl });
  if (sms.action === "skip") {
    notices.push({
      audience,
      channel: "sms",
      to: null,
      userId: party.userId,
      locale,
      smsBody: body,
      smsAction: "skip",
      smsReason: sms.reason,
    });
    return;
  }
  if (sms.action === "hold") {
    notices.push({
      audience,
      channel: "sms",
      to: null,
      userId: party.userId,
      locale,
      smsBody: body,
      smsAction: "hold",
      sendAfter: nextAlertSendAt(now, party.timeZone).toISOString(),
    });
    return;
  }
  notices.push({
    audience,
    channel: "sms",
    to: null,
    userId: party.userId,
    locale,
    smsBody: body,
    smsAction: "send",
  });
}

function nextStatus(
  type: string,
  previous: ParentInvoiceStatus | null,
): { status: ParentInvoiceStatus; notify: boolean } | null {
  if (type === "invoice.paid") {
    if (previous === "paid") return { status: "paid", notify: false };
    return { status: "paid", notify: true };
  }
  if (type === "invoice.payment_failed") {
    if (previous === "paid") return null;
    if (previous === "failed") return { status: "failed", notify: false };
    return { status: "failed", notify: true };
  }
  if (previous === "paid" || previous === "failed") return { status: previous, notify: false };
  if (previous === "open") return { status: "open", notify: false };
  return { status: "open", notify: true };
}

type Parsed = {
  id: string;
  number: string;
  currency: string;
  amountDue: number | null;
  amountPaid: number | null;
  total: number | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  parentUserId: string | null;
  daycareId: string | null;
  customerEmail: string | null;
  skip: "fee_tax" | "subscription" | null;
};

function parseInvoiceObject(
  object: unknown,
  links?: { parentUserId?: string | null; daycareId?: string | null },
): Parsed | null {
  const row = asRecord(object);
  if (!row) return null;
  const id = cleanId(row.id);
  if (!id.startsWith("in_")) return null;
  const meta = asRecord(row.metadata) ?? {};
  const kidease = cleanText(meta.kidease);
  if (kidease === "fee_tax") {
    return emptyParsed(id, "fee_tax");
  }
  const parentUserId = cleanId(links?.parentUserId) || cleanId(meta.parent_user_id) || cleanId(meta.parentUserId);
  const daycareId = cleanId(links?.daycareId) || cleanId(meta.daycare_id) || cleanId(meta.daycareId);
  const billId = cleanId(meta.bill_id) || cleanId(meta.billId);
  const linked = Boolean(parentUserId || daycareId || billId || kidease === "bill" || kidease === "parent_invoice");
  const subscription = row.subscription;
  const hasSubscription = typeof subscription === "string" ? subscription.trim() !== "" : Boolean(subscription && typeof subscription === "object");
  if (hasSubscription && !linked) return emptyParsed(id, "subscription");
  const transitions = asRecord(row.status_transitions);
  const paidUnix = typeof transitions?.paid_at === "number" ? transitions.paid_at : null;
  return {
    id,
    number: cleanText(row.number) || id,
    currency: (cleanText(row.currency) || "cad").toLowerCase().slice(0, 8),
    amountDue: cents(row.amount_due),
    amountPaid: cents(row.amount_paid),
    total: cents(row.total),
    paidAt: paidUnix && paidUnix > 0 ? new Date(paidUnix * 1000).toISOString() : null,
    hostedInvoiceUrl: httpsUrl(row.hosted_invoice_url),
    invoicePdf: httpsUrl(row.invoice_pdf),
    parentUserId: parentUserId || null,
    daycareId: daycareId || null,
    customerEmail: cleanEmail(cleanText(row.customer_email)),
    skip: null,
  };
}

function emptyParsed(id: string, skip: "fee_tax" | "subscription"): Parsed {
  return {
    id,
    number: id,
    currency: "cad",
    amountDue: null,
    amountPaid: null,
    total: null,
    paidAt: null,
    hostedInvoiceUrl: null,
    invoicePdf: null,
    parentUserId: null,
    daycareId: null,
    customerEmail: null,
    skip,
  };
}

function amountFor(parsed: Parsed, status: ParentInvoiceStatus): number | null {
  if (status === "paid") return parsed.amountPaid ?? parsed.total ?? parsed.amountDue;
  return parsed.amountDue ?? parsed.total ?? parsed.amountPaid;
}

function emailCopy(input: {
  kind: Kind;
  locale: InvoiceLocale;
  number: string;
  money: string | null;
  when: string;
  appUrl: string;
  payUrl: string | null;
  pdfUrl: string | null;
}): { subject: string; text: string; html: string } {
  const fr = input.locale === "fr";
  const number = input.number;
  const money = input.money;
  let subject: string;
  let lines: string[];
  if (input.kind === "paid") {
    subject = fr ? `Facture ${number} payée` : `Invoice ${number} paid`;
    lines = fr
      ? [
          "Payée",
          money ? `Montant : ${money}` : "",
          `Facture : ${number}`,
          `Date : ${input.when}`,
          `Voir la facture dans KidEase : ${input.appUrl}`,
        ]
      : [
          "Paid",
          money ? `Amount: ${money}` : "",
          `Invoice: ${number}`,
          `Date: ${input.when}`,
          `View the invoice in KidEase: ${input.appUrl}`,
        ];
  } else if (input.kind === "failed") {
    subject = fr ? `Paiement échoué pour la facture ${number}` : `Payment failed for invoice ${number}`;
    lines = fr
      ? [
          `Le paiement de la facture ${number} n’est pas passé.`,
          money ? `Montant : ${money}` : "",
          input.payUrl ? `Payer : ${input.payUrl}` : "",
          `Voir la facture dans KidEase : ${input.appUrl}`,
        ]
      : [
          `The payment for invoice ${number} did not go through.`,
          money ? `Amount: ${money}` : "",
          input.payUrl ? `Pay: ${input.payUrl}` : "",
          `View the invoice in KidEase: ${input.appUrl}`,
        ];
  } else {
    subject = fr ? `Facture ${number} prête` : `Invoice ${number} is ready`;
    lines = fr
      ? [
          `Votre facture ${number} est prête.`,
          money ? `Montant : ${money}` : "",
          input.payUrl ? `Payer : ${input.payUrl}` : "",
          input.pdfUrl ? `PDF : ${input.pdfUrl}` : "",
          `Voir la facture dans KidEase : ${input.appUrl}`,
        ]
      : [
          `Your invoice ${number} is ready.`,
          money ? `Amount: ${money}` : "",
          input.payUrl ? `Pay: ${input.payUrl}` : "",
          input.pdfUrl ? `PDF: ${input.pdfUrl}` : "",
          `View the invoice in KidEase: ${input.appUrl}`,
        ];
  }
  const text = lines.filter(Boolean).join("\n");
  const html = `<p>${text
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>")}</p>`;
  return { subject, text, html };
}

function smsBody(input: {
  kind: Kind;
  locale: InvoiceLocale;
  number: string;
  money: string | null;
  when: string;
  appUrl: string;
  payUrl: string | null;
}): string {
  const fr = input.locale === "fr";
  const amount = input.money ? ` ${input.money}` : "";
  const pay = input.payUrl || input.appUrl;
  if (input.kind === "paid") {
    return fr
      ? `KidEase : Payé${amount} pour la facture ${input.number} le ${input.when}. ${input.appUrl} Répondez STOP pour arrêter.`
      : `KidEase: Paid${amount} for invoice ${input.number} on ${input.when}. ${input.appUrl} Reply STOP to opt out.`;
  }
  if (input.kind === "failed") {
    return fr
      ? `KidEase : Le paiement de la facture ${input.number} a échoué${amount ? ` (${input.money})` : ""}. Payer : ${pay} Répondez STOP pour arrêter.`
      : `KidEase: Payment failed for invoice ${input.number}${input.money ? ` (${input.money})` : ""}. Pay: ${pay} Reply STOP to opt out.`;
  }
  return fr
    ? `KidEase : Facture ${input.number}${input.money ? ` de ${input.money}` : ""} est prête. Payer : ${pay} Répondez STOP pour arrêter.`
    : `KidEase: Invoice ${input.number}${input.money ? ` for ${input.money}` : ""} is ready. Pay: ${pay} Reply STOP to opt out.`;
}

function formatWhen(iso: string | null, locale: InvoiceLocale, now: Date): string {
  const date = iso ? new Date(iso) : now;
  const safe = Number.isNaN(date.getTime()) ? now : date;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(safe);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanId(value: unknown): string {
  return cleanText(value).slice(0, 80);
}

function cleanEmail(value: unknown): string | null {
  const email = cleanText(value).toLowerCase();
  if (!email || !email.includes("@") || email.length > 200) return null;
  return email;
}

function cents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function httpsUrl(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
