export type InboxView = "family" | "centre";

export function parseInboxView(raw: unknown): InboxView | undefined {
  if (raw === "centre" || raw === "family") return raw;
  return undefined;
}

export function inboxSearch(view: InboxView | undefined): { view?: InboxView } {
  return view === "centre" ? { view: "centre" } : {};
}

/** Daycare desk (or explicit ?view=centre) uses the provider inbox. */
export function resolveInboxView(input: {
  search?: unknown;
  sticky?: string | null;
}): InboxView {
  const fromSearch = parseInboxView(input.search);
  if (fromSearch) return fromSearch;
  if (input.sticky === "provider" || input.sticky === "director" || input.sticky === "daycare") {
    return "centre";
  }
  return "family";
}
