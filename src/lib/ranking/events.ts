/**
 * Ranking events. Consent-gated through capturePostHogEvent.
 * No child names, birthdates, emails, phones, or message text.
 * Property keys are an allowlist so a caller cannot sneak PII in.
 */

import { capturePostHogEvent } from "@/lib/posthog";
import type { RankingVariant } from "./variant.ts";

export const RANKING_EVENTS = [
  "search_performed",
  "listing_viewed",
  "listing_saved",
  "compare_opened",
  "tour_requested",
  "spot_requested",
  "message_started",
  "phone_clicked",
  "website_clicked",
] as const;

export type RankingEvent = (typeof RANKING_EVENTS)[number];

const ALLOWED = new Set([
  "city",
  "age_group",
  "filters",
  "sort",
  "result_count",
  "listing_id",
  "position",
  "variant",
  "listing_count",
]);

export type RankingEventProps = {
  city?: string;
  age_group?: string;
  filters?: string;
  sort?: string;
  result_count?: number;
  listing_id?: string;
  position?: number;
  variant?: RankingVariant;
  listing_count?: number;
};

export function rankingEventProperties(input: RankingEventProps): Record<string, string | number> {
  const next: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED.has(key) || value == null) continue;
    if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
    if (typeof value === "string") {
      const clean = value.trim().slice(0, 80);
      if (clean) next[key] = clean;
    }
  }
  return next;
}

export function captureRankingEvent(event: RankingEvent, input: RankingEventProps = {}) {
  capturePostHogEvent(event, rankingEventProperties(input));
}

/** http(s) only. Empty when the stored website is blank or not a URL. */
export function publicWebsiteHref(raw?: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 300) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Digits only, for a tel: link. The number is never sent to analytics. */
export function publicTelHref(raw?: string | null): string | null {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  const count = digits.replace(/\D/g, "").length;
  if (count < 7 || count > 15) return null;
  return `tel:${digits}`;
}
