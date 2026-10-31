/**
 * Owner identity review, duplicate signals, and a 24 hour report clock.
 * FEATURE_TRUST_SAFETY and FEATURE_STRIPE_IDENTITY default off.
 * Stripe Identity is never called unless that second flag and a restricted key are set.
 */

import { planSafeDuplicateGroups, type DetectListing } from "./duplicate-detect.ts";

export const TRUST_SAFETY_FLAG = "FEATURE_TRUST_SAFETY";
export const STRIPE_IDENTITY_FLAG = "FEATURE_STRIPE_IDENTITY";
export const REPORT_SLA_MS = 24 * 60 * 60 * 1000;
export const IDENTITY_MAX_BYTES = 8 * 1024 * 1024;

export const IDENTITY_KINDS = ["government_id", "business_registration"] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

const IDENTITY_MIMES = new Set(["image/jpeg", "image/png", "application/pdf"]);

export type TrustEnv = Record<string, string | undefined>;

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function trustSafetyEnabled(env?: TrustEnv): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[TRUST_SAFETY_FLAG]) || flagOn(bag[`VITE_${TRUST_SAFETY_FLAG}`]);
}

export function stripeIdentityEnabled(env?: TrustEnv): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[STRIPE_IDENTITY_FLAG]) || flagOn(bag[`VITE_${STRIPE_IDENTITY_FLAG}`]);
}

export function reportDueAt(created: Date): Date {
  return new Date(created.getTime() + REPORT_SLA_MS);
}

export type ReportSla = "open" | "due_soon" | "over" | "done";

/** Open reports are due 24 hours after they arrive. Reviewed rows are done. */
export function reportSla(input: { status: string; createdAt: string; now: Date }): ReportSla {
  if (input.status === "reviewed" || input.status === "dismissed" || input.status === "approved") return "done";
  const created = new Date(input.createdAt);
  if (Number.isNaN(created.getTime())) return "open";
  const due = reportDueAt(created).getTime();
  if (input.now.getTime() > due) return "over";
  if (due - input.now.getTime() <= 2 * 60 * 60 * 1000) return "due_soon";
  return "open";
}

export function identityUploadDecision(input: {
  enabled: boolean;
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
}): { ok: true; kind: IdentityKind } | { ok: false; reason: "off" | "kind" | "file" | "size" | "child" } {
  if (!input.enabled) return { ok: false, reason: "off" };
  if (!(IDENTITY_KINDS as readonly string[]).includes(input.kind)) return { ok: false, reason: "kind" };
  const name = input.filename.toLowerCase();
  if (/\b(child|children|kid|kids|toddler|infant|face|faces)\b/.test(name)) return { ok: false, reason: "child" };
  if (!IDENTITY_MIMES.has(input.mime)) return { ok: false, reason: "file" };
  if (!Number.isFinite(input.bytes) || input.bytes < 1 || input.bytes > IDENTITY_MAX_BYTES) {
    return { ok: false, reason: "size" };
  }
  return { ok: true, kind: input.kind as IdentityKind };
}

/**
 * Stripe Identity stays optional. No request is described unless the flag and key exist.
 * The key value is never returned.
 */
export function stripeIdentityGate(env: TrustEnv = {}): { call: false; reason: "off" | "missing_key" } | { call: true } {
  if (!stripeIdentityEnabled(env)) return { call: false, reason: "off" };
  const key = String(env.STRIPE_IDENTITY_RESTRICTED_KEY || "").trim();
  if (!key.startsWith("rk_")) return { call: false, reason: "missing_key" };
  return { call: true };
}

/** Calls Stripe only when the gate is open. Tests pass a fake fetch. */
export async function maybeStartStripeIdentity(
  env: TrustEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ called: boolean; reason: string }> {
  const gate = stripeIdentityGate(env);
  if (!gate.call) return { called: false, reason: gate.reason };
  const key = String(env.STRIPE_IDENTITY_RESTRICTED_KEY || "").trim();
  const body = new URLSearchParams({ type: "document" });
  const response = await fetchImpl("https://api.stripe.com/v1/identity/verification_sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return { called: true, reason: response.ok ? "started" : "stripe_error" };
}

export type ListingReview = { id: string; score: number; reasons: string[] };

/**
 * Flags listings for a person to review. Nothing is hidden or merged here.
 * A protected listing from the duplicate planner is left out.
 */
export function listingReviewSignals(rows: DetectListing[]): ListingReview[] {
  const planned = planSafeDuplicateGroups(rows);
  const byId = new Map<string, ListingReview>();
  function add(id: string, points: number, reason: string) {
    const current = byId.get(id) ?? { id, score: 0, reasons: [] };
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    current.score = Math.min(100, current.score + points);
    byId.set(id, current);
  }
  for (const plan of planned.plans) {
    const points = plan.reason === "licence" ? 80 : 50;
    for (const id of plan.retiredIds) add(id, points, `duplicate_${plan.reason}`);
  }
  for (const row of rows) {
    const licence = String(row.licenseNumber || "").trim();
    const postal = String(row.postalCode || "").trim();
    const name = String(row.name || "").trim();
    if (!licence && !postal && name) add(row.id, 40, "thin_listing");
  }
  return [...byId.values()].filter((row) => row.score >= 60).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
