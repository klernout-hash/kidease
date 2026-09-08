import type { DeskKey } from "@/lib/desks";

export type InboxView = "family" | "centre";

export function parseInboxView(raw: unknown): InboxView | undefined {
  if (raw === "centre" || raw === "family") return raw;
  return undefined;
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
