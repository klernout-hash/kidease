/**
 * Saved cards, autopay, instalments, and a fee estimate.
 * No KidEase subscription and no in-app purchase.
 * Every flag defaults off. Card numbers are never stored.
 */

import { estimateNetCost, type NetCostInput, type NetCostResult } from "./net-cost-engine.ts";

export const SAVED_PAYMENTS_FLAG = "FEATURE_SAVED_PAYMENTS";
export const AUTOPAY_FLAG = "FEATURE_AUTOPAY";
export const FEE_ESTIMATOR_FLAG = "FEATURE_FEE_ESTIMATOR";
export const INSTALMENTS_FLAG = "FEATURE_INSTALMENTS";

const BRANDS = ["visa", "mastercard", "amex", "other"] as const;
export type CardBrand = (typeof BRANDS)[number];

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function read(env: Record<string, string | undefined> | undefined, key: string): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[key]) || flagOn(bag[`VITE_${key}`]);
}

export function savedPaymentsEnabled(env?: Record<string, string | undefined>): boolean {
  return read(env, SAVED_PAYMENTS_FLAG);
}
export function autopayEnabled(env?: Record<string, string | undefined>): boolean {
  return read(env, AUTOPAY_FLAG);
}
export function feeEstimatorEnabled(env?: Record<string, string | undefined>): boolean {
  return read(env, FEE_ESTIMATOR_FLAG);
}
export function instalmentsEnabled(env?: Record<string, string | undefined>): boolean {
  return read(env, INSTALMENTS_FLAG);
}

export function savedMethodView(input: {
  enabled: boolean;
  brand: string;
  last4: string;
  paymentMethodId: string;
}): { brand: CardBrand; last4: string; paymentMethodId: string } | { error: "off" | "card" | "id" } {
  if (!input.enabled) return { error: "off" };
  const last4 = input.last4.trim();
  if (!/^\d{4}$/.test(last4)) return { error: "card" };
  if (/\d{13,19}/.test(input.paymentMethodId)) return { error: "card" };
  if (!input.paymentMethodId.startsWith("pm_")) return { error: "id" };
  const brand = (BRANDS as readonly string[]).includes(input.brand) ? (input.brand as CardBrand) : "other";
  return { brand, last4, paymentMethodId: input.paymentMethodId };
}

/** Records consent. Does not create a Stripe charge. */
export function autopayDecision(input: {
  enabled: boolean;
  consent: boolean;
  paymentMethodId: string | null;
  invoiceStatus: string;
}): "off" | "no_consent" | "no_method" | "already_paid" | "ready" {
  if (!input.enabled) return "off";
  if (!input.consent) return "no_consent";
  if (!input.paymentMethodId?.startsWith("pm_")) return "no_method";
  if (input.invoiceStatus === "paid") return "already_paid";
  return "ready";
}

/** Equal parts in cents. The last part takes the remainder. No interest. */
export function splitInstalments(totalCents: number, parts: number): number[] | null {
  if (!Number.isInteger(totalCents) || totalCents < 1) return null;
  if (!Number.isInteger(parts) || parts < 2 || parts > 4) return null;
  if (totalCents < parts) return null;
  const base = Math.floor(totalCents / parts);
  const amounts = Array.from({ length: parts }, () => base);
  amounts[parts - 1] = totalCents - base * (parts - 1);
  return amounts;
}

export type FeeEstimate = NetCostResult & {
  kind: "estimate";
  disclaimerEn: string;
  disclaimerFr: string;
};

/** Uses the posted fee the parent typed. Does not invent a centre fee. */
export function feeEstimate(input: NetCostInput): FeeEstimate | null {
  if (!Number.isFinite(input.grossMonthly) || input.grossMonthly <= 0) return null;
  const result = estimateNetCost(input);
  return {
    ...result,
    kind: "estimate",
    disclaimerEn: "This is an estimate, not a bill and not a government decision.",
    disclaimerFr: "Ceci est une estimation, pas une facture et pas une décision du gouvernement.",
  };
}
