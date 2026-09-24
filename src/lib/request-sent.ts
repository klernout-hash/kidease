import { isStockListingPhoto, listingThumb } from "./listing-photo.ts";
import { isUnflaggedSharedFallbackSrc } from "./photo-honesty.ts";

/**
 * Same gate as listing-readiness `isRealListingPhoto`.
 * Duplicated here so this module stays free of `@/` imports and node tests can load it.
 */
function isConfirmableListingPhoto(src?: string | null): boolean {
  const p = (src || "").trim();
  if (!p) return false;
  if (p.includes("placeholder")) return false;
  if (p.includes("-logo")) return false;
  if (isUnflaggedSharedFallbackSrc(p)) return false;
  if (p.includes("/photos/wpg/")) return false;
  if (p.startsWith("data:image")) return true;
  if (p.startsWith("/photos/buildings/")) return true;
  if (p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

/** Listing requests that create an inquiry or a message thread. */
export type RequestSentKind = "info" | "tour" | "spot" | "message";

/**
 * Short lock on the send control after the API succeeds, before the
 * confirmation opens. Errors skip this — they should surface immediately.
 */
export const REQUEST_SENT_BEAT_MS = 480;

export function holdSendBeat(ms = REQUEST_SENT_BEAT_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function requestSentTitleKey(kind: RequestSentKind) {
  return kind === "tour" ? ("requestSentHeadlineTour" as const) : ("requestSentHeadline" as const);
}

export function requestSentBodyKey(kind: RequestSentKind) {
  switch (kind) {
    case "tour":
      return "requestSentBodyTour" as const;
    case "spot":
      return "requestSentBodySpot" as const;
    case "message":
      return "requestSentBodyMessage" as const;
    default:
      return "requestSentBodyInfo" as const;
  }
}

/**
 * Real listing still only. Placeholders, stock marketing shots, and shared
 * street-view fallbacks stay off the confirmation card.
 */
export function requestSentThumb(photos: string[] | null | undefined): string | null {
  const thumb = listingThumb(photos ?? undefined);
  if (!thumb || isStockListingPhoto(thumb) || !isConfirmableListingPhoto(thumb)) return null;
  return thumb;
}
