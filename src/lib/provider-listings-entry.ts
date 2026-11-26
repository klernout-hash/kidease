type ListingsEntry = "pending" | "retry" | "unavailable" | "empty" | "ready";

export function providerListingsEntry(input: {
  deskSettled: boolean;
  deskLoadFailed: boolean;
  sessionReady: boolean;
  layoutKnown: boolean;
  listingIds: readonly string[];
  requestedCentre?: string;
}): ListingsEntry {
  if (input.deskLoadFailed || (input.sessionReady && !input.layoutKnown)) return "retry";
  if (!input.deskSettled || !input.layoutKnown) return "pending";
  if (input.requestedCentre && !input.listingIds.includes(input.requestedCentre))
    return "unavailable";
  return input.listingIds.length ? "ready" : "empty";
}
