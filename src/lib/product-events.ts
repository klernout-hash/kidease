/**
 * Named product events. FEATURE_PRODUCT_EVENTS defaults off.
 * Properties are coarse. Names, email, phone, child, and address are dropped.
 */
import { envFlagOn, envFlagSet } from "./flags.ts";
import { productEventsEnabled, type EnvMap } from "./features.ts";

export const PRODUCT_EVENTS = [
  "signup_started",
  "signup_completed",
  "search_performed",
  "listing_viewed",
  "waitlist_joined",
  "enrolment_requested",
  "invoice_paid",
  "claim_started",
  "inclusive_filter_applied",
  "tour_confirmation_sent",
  "tour_confirmation_failed",
  "centre_context_switched",
  "tour_followup_sent",
  "tour_followup_skipped",
  "document_request_created",
  "document_request_fulfilled",
  "agreement_sent",
  "agreement_completed",
  "form_share_email_sent",
  "family_email_sent",
  "email_bounced",
  "csv_exported",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

const EVENT_SET = new Set<string>(PRODUCT_EVENTS);

const ALLOWED_KEYS = new Set([
  "role",
  "province",
  "source",
  "method",
  "result",
  "count_bucket",
  "surface",
  "key",
  "channel",
  "locale",
  "reason",
  "list",
  "doc_type",
  "days_bucket",
  "hours_bucket",
  "signer_count",
  "recipients_bucket",
  "batched",
  "type",
]);

const PII = /email|e-mail|phone|name|child|address|postal|street|slug|token|secret|password|birth/i;

export function isProductEvent(value: string): value is ProductEventName {
  return EVENT_SET.has(value);
}

export function countBucket(count: number): "0" | "1-5" | "6+" {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count <= 5) return "1-5";
  return "6+";
}

export function provinceCode(value: unknown): string | undefined {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/** Returns null when the event name is unknown. Drops anything that looks personal. */
export function sanitizeProductProperties(
  event: string,
  properties: Record<string, unknown> | undefined,
): Record<string, string> | null {
  if (!isProductEvent(event)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(properties || {})) {
    if (!ALLOWED_KEYS.has(key) || PII.test(key)) continue;
    const value = String(raw ?? "").trim().slice(0, 40);
    if (!value || value.includes("@") || /\d{3}[-.\s]?\d{3}/.test(value)) continue;
    out[key] = value;
  }
  return out;
}

export function productEventsClientEnabled(env?: EnvMap): boolean {
  const bag =
    env ??
    ((import.meta as { env?: EnvMap }).env ?? {});
  const raw = bag.VITE_FEATURE_PRODUCT_EVENTS ?? bag.FEATURE_PRODUCT_EVENTS;
  if (!envFlagSet(raw)) return false;
  return envFlagOn(raw);
}

export function productEventsServerEnabled(env?: EnvMap): boolean {
  return productEventsEnabled(env);
}
