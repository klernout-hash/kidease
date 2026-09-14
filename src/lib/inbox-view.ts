import type { DeskKey } from "@/lib/desks";

export type InboxView = "family" | "centre";

export function parseInboxView(raw: unknown): InboxView | undefined {
  if (raw === "centre" || raw === "family") return raw;
  return undefined;
}

export type InboxSearch = {
  view?: InboxView;
  detail?: true;
  tour?: string;
};

export function parseInboxSearch(s: Record<string, unknown>): InboxSearch {
  const view = parseInboxView(s.view);
  const detail = s.detail === true || s.detail === "1" || s.detail === 1;
  const tour = typeof s.tour === "string" && s.tour.trim() ? s.tour.trim() : undefined;
  return {
    ...(view ? { view } : {}),
    ...(detail ? { detail: true as const } : {}),
    ...(tour ? { tour } : {}),
  };
}

export function inboxSearch(view: InboxView | undefined): { view?: InboxView } {
  return view === "centre" ? { view: "centre" } : view === "family" ? { view: "family" } : {};
}

/** Provider / Daycare desk only — parent inbox stays family. */
export function inboxViewForDesk(desk?: DeskKey | string | null): InboxView {
  return desk === "provider" || desk === "director" || desk === "daycare" ? "centre" : "family";
}

/** Daycare desk (or explicit ?view=centre) uses the provider inbox. */
export function resolveInboxView(input: {
  search?: unknown;
  sticky?: string | null;
}): InboxView {
  const fromSearch = parseInboxView(input.search);
  if (fromSearch) return fromSearch;
  return inboxViewForDesk(input.sticky);
}

function unreadCount(n: unknown): number {
  const value = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return value > 0 ? value : 0;
}

/** Badge must match the inbox list for the active desk (family vs centre). */
export function inboxUnreadForDesk(
  session:
    | {
        unread?: number;
        unreadFamily?: number;
        unreadCentre?: number;
      }
    | null
    | undefined,
  desk?: DeskKey | string | null,
): number {
  if (!session) return 0;
  const view = inboxViewForDesk(desk);
  if (view === "centre") return unreadCount(session.unreadCentre ?? session.unread);
  return unreadCount(session.unreadFamily ?? session.unread);
}
