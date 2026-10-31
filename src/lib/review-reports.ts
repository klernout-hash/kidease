/**
 * Verified-parent review reports and when a rating summary may show.
 * A summary never invents a star. One published review can show only when
 * FEATURE_REVIEW_REPORTS is on. Otherwise the public floor stays at 3.
 */

export const REVIEW_REPORT_REASONS = ["not_a_parent", "private_info", "spam", "other"] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

/** Shown on cards and profiles when the report flag is on. */
export const EARLY_REVIEW_FLOOR = 1;

export function isReviewReportReason(value: string): value is ReviewReportReason {
  return (REVIEW_REPORT_REASONS as readonly string[]).includes(value);
}

export function ratingFloor(enabled: boolean, standardFloor: number): number {
  return enabled ? EARLY_REVIEW_FLOOR : standardFloor;
}

export function parentRatingShown(
  count: number | null | undefined,
  ratingX10: number | null | undefined,
  floor: number,
): boolean {
  return (count ?? 0) >= floor && (ratingX10 ?? 0) > 0;
}

export function formatParentRating(ratingX10: number): string {
  return (ratingX10 / 10).toFixed(1);
}

/** A signed-in person can report a published review that is not their own. */
export function canReportReview(input: {
  enabled: boolean;
  status?: string | null;
  reporterUserId?: string | null;
  authorUserId?: string | null;
  reviewId?: string | null;
}): boolean {
  if (!input.enabled) return false;
  if (!input.reviewId || !input.reporterUserId) return false;
  const status = String(input.status || "");
  if (status !== "published" && status !== "approved") return false;
  if (input.authorUserId && input.authorUserId === input.reporterUserId) return false;
  return true;
}

export function reviewReportDetail(reviewId: string, note: string): string {
  const clean = note.replace(/\s+/g, " ").trim().slice(0, 500);
  return clean ? `review:${reviewId} ${clean}` : `review:${reviewId}`;
}

const COPY = {
  en: {
    report: "Report review",
    reason: "Why are you reporting this review?",
    not_a_parent: "This does not look like a parent review",
    private_info: "It shares private information",
    spam: "Spam",
    other: "Something else",
    note: "Add a short note",
    send: "Send report",
    sent: "Report sent. KidEase will read it.",
    off: "Review reports are not open yet.",
    help: "Help",
    compare: "Parent rating",
    few: "Not enough parent reviews yet",
  },
  fr: {
    report: "Signaler l'avis",
    reason: "Pourquoi signalez-vous cet avis?",
    not_a_parent: "Cela ne ressemble pas à un avis de parent",
    private_info: "Il contient des renseignements privés",
    spam: "Pourriel",
    other: "Autre chose",
    note: "Ajoutez une courte note",
    send: "Envoyer le signalement",
    sent: "Signalement envoyé. KidEase va le lire.",
    off: "Les signalements d'avis ne sont pas ouverts.",
    help: "Aide",
    compare: "Note des parents",
    few: "Pas assez d'avis de parents",
  },
} as const;

export function reviewReportCopy(locale: "en" | "fr") {
  return locale === "fr" ? COPY.fr : COPY.en;
}
