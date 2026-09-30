/**
 * Ranking events. Consent-gated. No child names, birthdates, emails, phones, or messages.
 * Listing events include position and the active sort when the last search stored them.
 */

import { readAnalyticsConsent } from "@/lib/analytics-consent";
import { capturePostHogEvent } from "@/lib/posthog";
import { recordRankingEvent } from "@/lib/server/ranking-events";
import { rankListingContext } from "./context.ts";
import { type RankingEventName } from "./names.ts";

export { RANKING_EVENT_NAMES, type RankingEventName } from "./names.ts";

export type RankingEventInput = {
  city?: string | null;
  ageGroup?: string | null;
  filters?: string | null;
  sort?: string | null;
  resultCount?: number | null;
  listingId?: string | null;
  position?: number | null;
  variant?: "best_match" | "nearest" | null;
};

const LISTING_EVENTS = new Set<RankingEventName>([
  "listing_viewed",
  "listing_saved",
  "compare_opened",
  "tour_requested",
  "spot_requested",
  "message_started",
  "phone_clicked",
  "website_clicked",
]);

export function trackRankingEvent(name: RankingEventName, input: RankingEventInput = {}) {
  if (readAnalyticsConsent() !== "granted") return;
  const listing = input.listingId ? rankListingContext(input.listingId) : null;
  const sort = (input.sort || listing?.sort || "distance").slice(0, 32);
  const position =
    typeof input.position === "number" && Number.isFinite(input.position)
      ? input.position
      : (listing?.position ?? null);
  const props: Record<string, unknown> = {
    city: (input.city || "").trim().slice(0, 80),
    age_group: (input.ageGroup || "any").slice(0, 24),
    filters: (input.filters || "").slice(0, 120),
    sort,
    variant:
      input.variant === "best_match" ? "best_match" : input.variant === "nearest" ? "nearest" : listing?.variant || "nearest",
  };
  if (typeof input.resultCount === "number" && Number.isFinite(input.resultCount)) {
    props.result_count = Math.max(0, Math.round(input.resultCount));
  }
  if (input.listingId) props.listing_id = input.listingId.slice(0, 80);
  if (LISTING_EVENTS.has(name) && typeof position === "number") props.position = position;
  capturePostHogEvent(name, props);
  void recordRankingEvent({
    data: {
      name,
      city: input.city,
      ageGroup: input.ageGroup,
      filters: input.filters,
      sort,
      resultCount: input.resultCount,
      listingId: input.listingId,
      position,
      variant: props.variant === "best_match" ? "best_match" : "nearest",
    },
  }).catch(() => undefined);
}
