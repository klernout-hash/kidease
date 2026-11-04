/**
 * Report a listing, a centre, or a message thread, and block messages.
 * No database here. The server module writes the rows.
 */

export const SAFETY_TARGETS = ["listing", "centre", "thread", "review"] as const;
export type SafetyTarget = (typeof SAFETY_TARGETS)[number];

export const SAFETY_REASONS = ["harassment", "spam", "unsafe", "misleading", "other"] as const;
export type SafetyReason = (typeof SAFETY_REASONS)[number];

export const SAFETY_STATUSES = ["open", "reviewed", "dismissed"] as const;
export const REVIEW_MODERATION_ACTIONS = ["keep_review", "hide_review", "remove_review"] as const;
export type ReviewModerationAction = (typeof REVIEW_MODERATION_ACTIONS)[number];
export type SafetyStatus = (typeof SAFETY_STATUSES)[number];

export type SafetyBlock = {
  blockerUserId: string;
  blockedUserId: string | null;
  daycareId: string | null;
};

export function isSafetyTarget(value: string): value is SafetyTarget {
  return (SAFETY_TARGETS as readonly string[]).includes(value);
}

export function isSafetyReason(value: string): value is SafetyReason {
  return (SAFETY_REASONS as readonly string[]).includes(value);
}

export function isSafetyStatus(value: string): value is SafetyStatus {
  return (SAFETY_STATUSES as readonly string[]).includes(value);
}

export function isReviewModerationAction(value: string): value is ReviewModerationAction {
  return (REVIEW_MODERATION_ACTIONS as readonly string[]).includes(value);
}

/** Reported reviews are labeled Review. Other reports keep their own name. */
export function moderationLabel(target: string, locale: "en" | "fr" = "en"): string {
  const fr = locale === "fr";
  if (target === "review") return fr ? "Avis" : "Review";
  if (target === "listing") return fr ? "Fiche" : "Listing";
  if (target === "centre") return "Centre";
  if (target === "thread") return "Message";
  return fr ? "Signalement" : "Report";
}

export function moderationActions(target: string): readonly ["keep_review", "hide_review", "remove_review"] | readonly ["reviewed", "dismissed"] {
  return target === "review" ? REVIEW_MODERATION_ACTIONS : (["reviewed", "dismissed"] as const);
}

export function moderationActionLabel(action: string, locale: "en" | "fr" = "en"): string {
  const fr = locale === "fr";
  if (action === "keep_review") return fr ? "Garder l’avis" : "Keep review";
  if (action === "hide_review") return fr ? "Masquer l’avis" : "Hide review";
  if (action === "remove_review") return fr ? "Retirer l’avis" : "Remove review";
  if (action === "reviewed") return fr ? "Marquer comme vu" : "Mark reviewed";
  if (action === "dismissed") return fr ? "Écarter" : "Dismiss";
  return action;
}

const COPY = {
  en: {
    reportListing: "Report this listing",
    reportCentre: "Report this centre",
    reportThread: "Report this conversation",
    reportReview: "Report this review",
    block: "Block messages",
    unblock: "Unblock messages",
    blockDaycare: "Block this daycare",
    blockFamily: "Block family",
    blockConfirmTitle: "Block this person?",
    blockConfirmBody:
      "Blocking works both ways. It stops messages, voice and video calls, tour requests, enrolment requests, and reviews. The family is hidden from that daycare's request list. You can unblock later in Menu, under Privacy and safety.",
    blockConfirm: "Block",
    unblockPerson: "Unblock",
    blockedListTitle: "Blocked",
    blockedEmpty: "No one is blocked.",
    blockedSignIn: "Sign in to see people you blocked.",
    reportMenu: "Report",
    reason: "Reason",
    detail: "What happened",
    send: "Send report",
    sent: "Report sent. KidEase will review it.",
    cancel: "Cancel",
    signIn: "Sign in to report or block",
    blockedSend: "Messages are blocked on this conversation.",
    failed: "Could not send that. Email support@kidease.ca if it keeps failing.",
    blockedNow: "Messages from this person are blocked.",
    unblocked: "Messages are allowed again.",
    harassment: "Harassment or abuse",
    spam: "Spam",
    unsafe: "Safety concern",
    misleading: "Misleading listing",
    other: "Something else",
    helpTitle: "Safety and reporting",
    helpLead:
      "KidEase is for adults. You can report a listing, a centre, or a message, and you can block a daycare or a family. A block works both ways. It stops messages, calls, tour and enrolment requests, and reviews. The family is hidden from that daycare's request list.",
    helpReview: "KidEase staff review open reports. This is not a child-protection investigation.",
    helpEmail: "Email",
    helpMail: "Mail",
    helpPrivacy: "Privacy",
  },
  fr: {
    reportListing: "Signaler cette fiche",
    reportCentre: "Signaler ce centre",
    reportThread: "Signaler cette conversation",
    reportReview: "Signaler cet avis",
    block: "Bloquer les messages",
    unblock: "Débloquer les messages",
    blockDaycare: "Bloquer cette garderie",
    blockFamily: "Bloquer la famille",
    blockConfirmTitle: "Bloquer cette personne?",
    blockConfirmBody:
      "Le blocage marche dans les deux sens. Il arrête les messages, les appels vocaux et vidéo, les demandes de visite, les demandes d’inscription et les avis. La famille est cachée de la liste de demandes de cette garderie. Vous pouvez débloquer plus tard dans Menu, sous Confidentialité et sécurité.",
    blockConfirm: "Bloquer",
    unblockPerson: "Débloquer",
    blockedListTitle: "Bloqués",
    blockedEmpty: "Personne n’est bloqué.",
    blockedSignIn: "Connectez-vous pour voir les personnes bloquées.",
    reportMenu: "Signaler",
    reason: "Raison",
    detail: "Ce qui s’est passé",
    send: "Envoyer le signalement",
    sent: "Signalement envoyé. KidEase va le revoir.",
    cancel: "Annuler",
    signIn: "Connectez-vous pour signaler ou bloquer",
    blockedSend: "Les messages sont bloqués dans cette conversation.",
    failed: "Envoi impossible. Écrivez à support@kidease.ca si ça continue.",
    blockedNow: "Les messages de cette personne sont bloqués.",
    unblocked: "Les messages sont de nouveau permis.",
    harassment: "Harcèlement ou abus",
    spam: "Pourriel",
    unsafe: "Inquiétude pour la sécurité",
    misleading: "Fiche trompeuse",
    other: "Autre chose",
    helpTitle: "Sécurité et signalement",
    helpLead:
      "KidEase est pour les adultes. Vous pouvez signaler une fiche, un centre ou un message, et bloquer une garderie ou une famille. Le blocage marche dans les deux sens. Il arrête les messages, les appels, les demandes de visite et d’inscription, et les avis. La famille est cachée de la liste de demandes de cette garderie.",
    helpReview:
      "Le personnel KidEase revoit les signalements ouverts. Ce n’est pas une enquête de protection de l’enfance.",
    helpEmail: "Courriel",
    helpMail: "Poste",
    helpPrivacy: "Vie privée",
  },
} as const;

export function safetyText(locale: string) {
  return locale === "fr" ? COPY.fr : COPY.en;
}

export function safetyReasonLabel(locale: string, reason: SafetyReason): string {
  return safetyText(locale)[reason];
}

/**
 * True when a chat message must not be stored.
 * A block works in both directions. A parent who blocks a centre also stops
 * later staff on that centre.
 */
/** Same rule as chat: a block stops calls, requests, reviews, and new inquiries. */
export function interactionIsBlocked(input: {
  senderId: string;
  parentUserId: string;
  daycareId: string;
  centreUserIds: readonly string[];
  blocks: readonly SafetyBlock[];
}): boolean {
  return messageIsBlocked(input);
}

/** True when this parent must disappear from the daycare's request and family lists. */
export function parentIsHidden(input: {
  parentUserId: string;
  daycareId: string;
  blocks: readonly SafetyBlock[];
}): boolean {
  const parent = input.parentUserId;
  const daycare = input.daycareId;
  if (!parent || !daycare) return false;
  return input.blocks.some(
    (block) =>
      block.daycareId === daycare &&
      (block.blockerUserId === parent || block.blockedUserId === parent),
  );
}

export function messageIsBlocked(input: {
  senderId: string;
  parentUserId: string;
  daycareId: string;
  centreUserIds: readonly string[];
  blocks: readonly SafetyBlock[];
}): boolean {
  const sender = input.senderId;
  const parent = input.parentUserId;
  const daycare = input.daycareId;
  const centres = input.centreUserIds.filter((id) => id && id !== parent);
  const others = sender === parent ? centres : [parent];

  for (const block of input.blocks) {
    for (const other of others) {
      const userHit =
        (block.blockerUserId === sender && block.blockedUserId === other) ||
        (block.blockerUserId === other && block.blockedUserId === sender);
      if (userHit) return true;
    }
    const parentBlockedCentre =
      block.blockerUserId === parent && block.daycareId === daycare && !block.blockedUserId;
    if (parentBlockedCentre) return true;
  }
  return false;
}

export function viewerHasBlocked(input: {
  viewerId: string;
  parentUserId: string;
  daycareId: string;
  centreUserIds: readonly string[];
  blocks: readonly SafetyBlock[];
}): boolean {
  const others = input.viewerId === input.parentUserId ? input.centreUserIds : [input.parentUserId];
  return input.blocks.some((block) => {
    if (block.blockerUserId !== input.viewerId) return false;
    if (block.daycareId === input.daycareId && !block.blockedUserId && input.viewerId === input.parentUserId) {
      return true;
    }
    return others.some((other) => other && block.blockedUserId === other);
  });
}
