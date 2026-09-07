/**
 * Centre-desk demand heat, fill-risk, and reply/tour SLA.
 *
 * Built from real inquiry, vacancy, and reply timestamps only.
 * Missing samples stay unknown — KidEase never invents volume or SLA.
 * Paid analytics windows (7 vs 90 days) do not change these bands.
 */

import { MIN_THREAD_SAMPLE } from "@/lib/quality";
import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import type { Daycare } from "@/lib/types";

export const DEMAND_WINDOW_DAYS = 28;
export const SLA_OK_HOURS = 24;
export const TOUR_SLA_HOURS = 48;
export const MIN_DEMAND_REPLY_SAMPLE = MIN_THREAD_SAMPLE;

export const DEMAND_HEAT_BANDS = ["unknown", "quiet", "warm", "hot"] as const;
export type DemandHeatBand = (typeof DEMAND_HEAT_BANDS)[number];

export const FILL_RISK_BANDS = ["unknown", "low", "watch", "high"] as const;
export type FillRiskBand = (typeof FILL_RISK_BANDS)[number];

export const SLA_BANDS = ["unknown", "ok", "slow"] as const;
export type SlaBand = (typeof SLA_BANDS)[number];

export type DemandSignals = {
  /** Real 28-day parent-thread count. Omit when the query did not run. */
  inquiries28d?: number | null;
  tours28d?: number | null;
  bookings28d?: number | null;
  loaded?: boolean;
};

export type SlaSignals = {
  replyMedianHours?: number | null;
  replySample?: number;
  pendingTourOverdue?: number;
  unrepliedThreads?: number;
  loaded?: boolean;
};

export type DemandListing = Pick<
  Daycare,
  "spotsInfant" | "spotsToddler" | "spotsPreschool" | "lastVacancyUpdatedAt" | "spotsUpdatedAt" | "availabilityKnown"
> & {
  spotsTotal?: number;
};

export type DemandSnapshot = {
  heat: DemandHeatBand;
  fillRisk: FillRiskBand;
  sla: SlaBand;
  volume28d: number | null;
  inquiries28d: number | null;
  tours28d: number | null;
  bookings28d: number | null;
  vacancyAgeDays: number | null;
  replyMedianHours: number | null;
  replySample: number;
  pendingTourOverdue: number;
  unrepliedThreads: number;
};

function asCount(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function demandVolume28d(signals: DemandSignals): number | null {
  if (signals.loaded !== true) return null;
  const inquiries = asCount(signals.inquiries28d) ?? 0;
  const tours = asCount(signals.tours28d) ?? 0;
  const bookings = asCount(signals.bookings28d) ?? 0;
  return inquiries + tours + bookings;
}

export function demandHeatBand(signals: DemandSignals): DemandHeatBand {
  const volume = demandVolume28d(signals);
  if (volume == null) return "unknown";
  if (volume <= 0) return "quiet";
  if (volume >= 5) return "hot";
  return "warm";
}

export function vacancyAgeDays(
  item: DemandListing,
  now = Date.now(),
): number | null {
  const at = vacancyTimestamp(item);
  if (!at) return null;
  const ts = Date.parse(at);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((now - ts) / (24 * 60 * 60 * 1000)));
}

export function fillRiskBand(item: DemandListing, signals: DemandSignals, now = Date.now()): FillRiskBand {
  const vacancy = vacancyFreshness(vacancyTimestamp(item), now);
  if (vacancy.kind === "unknown") return "unknown";
  const spots =
    typeof item.spotsTotal === "number"
      ? item.spotsTotal
      : (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0);
  if (spots <= 0) return "low";
  const days = vacancyAgeDays(item, now);
  const volume = demandVolume28d(signals);
  if (vacancy.kind === "stale" || (days != null && days >= 14)) return "high";
  if (days != null && days >= 7) return volume != null && volume >= 5 ? "high" : "watch";
  return "low";
}

export function slaBand(signals: SlaSignals): SlaBand {
  if (signals.loaded !== true) return "unknown";
  const sample = Math.max(0, Math.floor(signals.replySample ?? 0));
  const hours = signals.replyMedianHours;
  if (sample < MIN_DEMAND_REPLY_SAMPLE) return "unknown";
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) return "unknown";
  return hours <= SLA_OK_HOURS ? "ok" : "slow";
}

export function demandSnapshot(
  item: DemandListing,
  demand: DemandSignals,
  sla: SlaSignals,
  now = Date.now(),
): DemandSnapshot {
  const inquiries28d = demand.loaded ? (asCount(demand.inquiries28d) ?? 0) : null;
  const tours28d = demand.loaded ? (asCount(demand.tours28d) ?? 0) : null;
  const bookings28d = demand.loaded ? (asCount(demand.bookings28d) ?? 0) : null;
  return {
    heat: demandHeatBand(demand),
    fillRisk: fillRiskBand(item, demand, now),
    sla: slaBand(sla),
    volume28d: demandVolume28d(demand),
    inquiries28d,
    tours28d,
    bookings28d,
    vacancyAgeDays: vacancyAgeDays(item, now),
    replyMedianHours: typeof sla.replyMedianHours === "number" ? sla.replyMedianHours : null,
    replySample: Math.max(0, Math.floor(sla.replySample ?? 0)),
    pendingTourOverdue: Math.max(0, Math.floor(sla.pendingTourOverdue ?? 0)),
    unrepliedThreads: Math.max(0, Math.floor(sla.unrepliedThreads ?? 0)),
  };
}

export function median(values: number[]): number | null {
  const clean = values.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[mid]!;
  return (clean[mid - 1]! + clean[mid]!) / 2;
}
