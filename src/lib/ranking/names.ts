/** Product event names for ranking. Keep this file free of other imports. */

export const RANKING_EVENT_NAMES = [
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

export type RankingEventName = (typeof RANKING_EVENT_NAMES)[number];
