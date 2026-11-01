/** Parent desk tabs. An unknown ?tab= falls back to Explore. */
export const PARENT_URL_TABS = [
  "explore",
  "saved",
  "enrolled",
  "requests",
  "profile",
  "payments",
  "subscription",
  "alerts",
  "children",
  "care",
  "waitlists",
  "stories",
  "learning",
] as const;

export type ParentUrlTab = (typeof PARENT_URL_TABS)[number];

export const PARENT_DESK_TABS = [
  "explore",
  "saved",
  "bookings",
  "payments",
  "subscription",
  "children",
  "alerts",
  "care",
  "waitlists",
] as const;

export type ParentDeskTab = (typeof PARENT_DESK_TABS)[number];

export function parentUrlTab(value: unknown): ParentUrlTab | undefined {
  return PARENT_URL_TABS.includes(value as ParentUrlTab) ? (value as ParentUrlTab) : undefined;
}

export function parentDeskTabOrDefault(value: unknown): ParentDeskTab {
  return PARENT_DESK_TABS.includes(value as ParentDeskTab) ? (value as ParentDeskTab) : "explore";
}
