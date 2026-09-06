/**
 * Support desk — client-safe types, gates, macros, refund policy.
 * Server functions live in src/lib/server/support.ts (createServerFn).
 * Do not import *.server.* from here.
 */

import { parseAppRole, type AppRole } from "./desks.ts";

export const SUPPORT_CASE_STATUSES = [
  "open",
  "waiting_parent",
  "waiting_centre",
  "waiting_stripe",
  "resolved",
  "closed",
] as const;
export type SupportCaseStatus = (typeof SUPPORT_CASE_STATUSES)[number];

export const SUPPORT_CASE_TYPES = [
  "billing",
  "claim",
  "listing",
  "account",
  "trust",
  "abuse",
  "other",
] as const;
export type SupportCaseType = (typeof SUPPORT_CASE_TYPES)[number];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_EVENT_KINDS = ["note", "email", "sms", "status", "refund", "system"] as const;
export type SupportEventKind = (typeof SUPPORT_EVENT_KINDS)[number];

/**
 * Canonical Support case inbox. Refunds are a billing case type on this mailbox.
 * Person addresses (e.g. kevin@) are not the case router. Do not invent refund@.
 */
export const SUPPORT_INBOX_EMAIL = "support@kidease.ca";

/** Default agent live-refund cap when SUPPORT_REFUND_MAX_CENTS is unset ($100 CAD). */
export const DEFAULT_SUPPORT_REFUND_MAX_CENTS = 10_000;

export const REFUND_REHEARSED_COPY = "Refund rehearsed — Stripe not live";

export type SupportCase = {
  id: string;
  status: SupportCaseStatus;
  type: SupportCaseType;
  priority: SupportPriority;
  subject: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  parentUserId: string | null;
  parentName: string | null;
  parentEmail: string | null;
  providerUserId: string | null;
  providerName: string | null;
  centreId: string | null;
  listingId: string | null;
  centreName: string | null;
  stripePaymentIntentId: string | null;
  billId: string | null;
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type SupportMetaValue = string | number | boolean | null;
export type SupportMeta = Record<string, SupportMetaValue>;

export type SupportCaseEvent = {
  id: string;
  caseId: string;
  actorUserId: string | null;
  actorName: string | null;
  kind: SupportEventKind;
  body: string | null;
  meta: SupportMeta | null;
  createdAt: string;
};

export type SupportStaff = {
  userId: string;
  name: string | null;
  email: string | null;
  role: AppRole;
};

/** Admin OR profiles.role support / support_lead. */
export function canAccessSupport(role: AppRole | string | null | undefined): boolean {
  const r = parseAppRole(role);
  return r === "admin" || r === "support" || r === "support_lead";
}

export function canAccessAdmin(role: AppRole | string | null | undefined): boolean {
  return parseAppRole(role) === "admin";
}

/** Live refunds above SUPPORT_REFUND_MAX_CENTS need support_lead or admin. */
export function canRefundUnlimited(role: AppRole | string | null | undefined): boolean {
  const r = parseAppRole(role);
  return r === "admin" || r === "support_lead";
}

export function isSupportCaseStatus(raw: string | null | undefined): raw is SupportCaseStatus {
  return (SUPPORT_CASE_STATUSES as readonly string[]).includes(raw || "");
}

export function isSupportCaseType(raw: string | null | undefined): raw is SupportCaseType {
  return (SUPPORT_CASE_TYPES as readonly string[]).includes(raw || "");
}

export function isSupportPriority(raw: string | null | undefined): raw is SupportPriority {
  return (SUPPORT_PRIORITIES as readonly string[]).includes(raw || "");
}

export function parseSupportStatus(raw: string | null | undefined): SupportCaseStatus {
  return isSupportCaseStatus(raw) ? raw : "open";
}

export function parseSupportType(raw: string | null | undefined): SupportCaseType {
  return isSupportCaseType(raw) ? raw : "other";
}

export function parseSupportPriority(raw: string | null | undefined): SupportPriority {
  return isSupportPriority(raw) ? raw : "normal";
}

export function supportStatusLabel(status: SupportCaseStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "waiting_parent":
      return "Waiting on parent";
    case "waiting_centre":
      return "Waiting on centre";
    case "waiting_stripe":
      return "Waiting on Stripe";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
  }
}

export function supportTypeLabel(type: SupportCaseType): string {
  switch (type) {
    case "billing":
      return "Billing";
    case "claim":
      return "Claim";
    case "listing":
      return "Listing";
    case "account":
      return "Account";
    case "trust":
      return "Trust";
    case "abuse":
      return "Abuse";
    case "other":
      return "Other";
  }
}

export function supportRefundMaxCents(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.SUPPORT_REFUND_MAX_CENTS || "").trim();
  if (!raw) return DEFAULT_SUPPORT_REFUND_MAX_CENTS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SUPPORT_REFUND_MAX_CENTS;
  return Math.floor(n);
}

export function refundAmountAllowed(input: {
  role: AppRole | string | null | undefined;
  amountCents: number;
  maxCents?: number;
}): boolean {
  if (canRefundUnlimited(input.role)) return true;
  const cap = input.maxCents ?? supportRefundMaxCents();
  return input.amountCents > 0 && input.amountCents <= cap;
}

export type RefundPath = "live" | "rehearse" | "blocked";

/**
 * Pure refund decision. Live Stripe calls happen only after this returns "live".
 * Rehearse never writes invoice/payment paid or refunded — case event only.
 */
export function decideSupportRefund(input: {
  stripeLive: boolean;
  paymentId: string | null | undefined;
  amountCents: number;
  role: AppRole | string | null | undefined;
  maxCents?: number;
}): { path: RefundPath; reason: string } {
  const amount = Math.floor(Number(input.amountCents) || 0);
  if (amount <= 0) return { path: "blocked", reason: "Enter a refund amount in cents." };
  if (!refundAmountAllowed({ role: input.role, amountCents: amount, maxCents: input.maxCents })) {
    return {
      path: "blocked",
      reason: `Agents are capped at ${input.maxCents ?? supportRefundMaxCents()} cents. A support lead or admin can refund more.`,
    };
  }
  if (!input.stripeLive) {
    return { path: "rehearse", reason: REFUND_REHEARSED_COPY };
  }
  if (!String(input.paymentId || "").trim()) {
    return { path: "blocked", reason: "No Stripe payment id on this bill — cannot refund live." };
  }
  return { path: "live", reason: "Stripe refunds API" };
}

export function stripeDashboardPaymentUrl(id: string | null | undefined, live = true): string | null {
  const raw = String(id || "").trim();
  if (!raw) return null;
  const host = live ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test";
  return `${host}/payments/${encodeURIComponent(raw)}`;
}

export function refundIdempotencyKey(input: {
  caseId: string;
  billId: string;
  amountCents: number;
}): string {
  return `ke-refund-${input.caseId}-${input.billId}-${Math.floor(input.amountCents)}`;
}

export type SupportMacro = {
  id: string;
  label: string;
  body: string;
};

/** Canned notes — not a Zendesk clone. */
export const SUPPORT_MACROS: SupportMacro[] = [
  {
    id: "refund_policy",
    label: "Refund policy",
    body: "KidEase refunds parent bills only after the centre and our money ledger agree. Live Stripe refunds go through the case money drawer (support lead / admin above the agent cap). The bill status updates when Stripe sends charge.refunded — we do not mark Paid or Refunded by hand.",
  },
  {
    id: "claim_help",
    label: "Claim help",
    body: "To claim a centre: open Claim a centre, search the licensed name, and upload the licence photo. Waiting claims sit on Admin → Waiting on you. We will not invent a live listing until that review lands.",
  },
  {
    id: "vacancy_update",
    label: "How to update vacancy",
    body: "On the centre desk, open My listings and confirm today’s open spots. After two weeks without a confirm, parents see “Ask about current spots” — not a made-up vacancy. KidEase does not invent open spots.",
  },
  {
    id: "parent_plus",
    label: "Parent Plus",
    body: "Parent Plus is a KidEase subscription (not centre tuition). Billing portal and plan status live on the parent desk. Priority support is a Plus perk; it does not change refund policy.",
  },
  {
    id: "trust_licence",
    label: "Trust / licence",
    body: "Licence number, registry match, and staff-screening attestation are on the centre desk → Licence. Reports and operator review stay on Admin → Trust. Support notes go on this case; we do not override a declined claim from here.",
  },
];

export function supportMacroById(id: string): SupportMacro | null {
  return SUPPORT_MACROS.find((m) => m.id === id) ?? null;
}

export function createCaseInput(input: {
  subject: string;
  type?: string;
  priority?: string;
  parentUserId?: string | null;
  providerUserId?: string | null;
  centreId?: string | null;
  billId?: string | null;
}): { subject: string; type: SupportCaseType; priority: SupportPriority } & Omit<
  typeof input,
  "subject" | "type" | "priority"
> {
  const subject = String(input.subject || "").trim();
  if (subject.length < 3) throw new Error("Subject needs at least 3 characters");
  return {
    ...input,
    subject: subject.slice(0, 200),
    type: parseSupportType(input.type),
    priority: parseSupportPriority(input.priority),
  };
}
