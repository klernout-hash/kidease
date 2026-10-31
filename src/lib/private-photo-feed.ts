/**
 * Classroom photos stay with the enrolled family.
 * A child's face is never a public listing or marketing photo.
 */

export function listingPhotoMayShowChildFace(): false {
  return false;
}

export function parentSeesPrivateFeed(input: { enabled: boolean; enrolled: boolean }): boolean {
  if (!input.enabled) return true;
  return input.enrolled;
}

export function classroomPhotoAllowed(input: {
  enabled: boolean;
  enrolled: boolean;
  consentAt?: string | null;
  photoCount: number;
}): { ok: true } | { ok: false; reason: "enrol" | "consent" } {
  if (!input.enabled || input.photoCount <= 0) return { ok: true };
  if (!input.enrolled) return { ok: false, reason: "enrol" };
  if (!input.consentAt || !Number.isFinite(Date.parse(input.consentAt))) return { ok: false, reason: "consent" };
  return { ok: true };
}

export const PRIVATE_FEED_COPY = {
  en: {
    title: "Photos stay in this feed",
    body: "Classroom photos are for enrolled parents who say yes. They are not on the public listing and not in ads. KidEase does not put a child's face on a public page.",
    consent: "I agree to classroom photos for my enrolled child",
    saved: "Photo consent saved.",
    help: "Help",
  },
  fr: {
    title: "Les photos restent dans ce fil",
    body: "Les photos de classe sont pour les parents inscrits qui disent oui. Elles ne sont pas sur la fiche publique ni dans les annonces. KidEase ne met pas le visage d'un enfant sur une page publique.",
    consent: "J'accepte les photos de classe pour mon enfant inscrit",
    saved: "Consentement enregistré.",
    help: "Aide",
  },
} as const;

export function privateFeedCopy(locale: "en" | "fr") {
  return locale === "fr" ? PRIVATE_FEED_COPY.fr : PRIVATE_FEED_COPY.en;
}
