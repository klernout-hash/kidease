export type ProviderDocumentsEntry =
  | { kind: "pending" | "retry" | "forbidden" | "empty" | "centre-unavailable" }
  | { kind: "ready"; centreId: string };

export function providerDocumentsEntry({
  deskSettled,
  deskLoadFailed,
  sessionReady,
  hasSession,
  canViewDocuments,
  listingIds,
  requestedCentre,
}: {
  deskSettled: boolean;
  deskLoadFailed: boolean;
  sessionReady: boolean;
  hasSession: boolean;
  canViewDocuments: boolean;
  listingIds: readonly string[];
  requestedCentre?: string;
}): ProviderDocumentsEntry {
  if (deskLoadFailed || (sessionReady && !hasSession)) return { kind: "retry" };
  if (!deskSettled || !hasSession) return { kind: "pending" };
  if (!canViewDocuments) return { kind: "forbidden" };
  if (requestedCentre) {
    return listingIds.includes(requestedCentre)
      ? { kind: "ready", centreId: requestedCentre }
      : { kind: "centre-unavailable" };
  }
  const centreId = listingIds[0];
  return centreId ? { kind: "ready", centreId } : { kind: "empty" };
}
