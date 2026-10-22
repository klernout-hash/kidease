/**
 * Report a listing, a centre, or a message thread, and block messages.
 * No database here. The server module writes the rows.
 */

export const SAFETY_TARGETS = ["listing", "centre", "thread"] as const;
export type SafetyTarget = (typeof SAFETY_TARGETS)[number];

export const SAFETY_REASONS = ["harassment", "spam", "unsafe", "misleading", "other"] as const;
export type SafetyReason = (typeof SAFETY_REASONS)[number];

export const SAFETY_STATUSES = ["open", "reviewed", "dismissed"] as const;
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

type Locale = "en" | "fr";

const COPY = {
  en: {
    reportListing: "Report this listing",
    reportCentre: "Report this centre",
    reportThread: "Report this conversation",
    block: "Block messages",
    unblock: "Unblock messages",
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
      "KidEase is for adults. You can report a listing, a centre, or a message, and you can block someone from messaging you.",
    helpReview: "We review open reports in the admin queue. This is not a child-protection investigation.",
    helpEmail: "Email",
    helpMail: "Mail",
    helpPrivacy: "Privacy",
  },
  fr: {
    reportListing: "Signaler cette fiche",
    reportCentre: "Signaler ce centre",
    reportThread: "Signaler cette conversation",
    block: "Bloquer les messages",
    unblock: "Débloquer les messages",
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
      "KidEase est pour les adultes. Vous pouvez signaler une fiche, un centre ou un message, et bloquer quelqu’un.",
    helpReview:
      "Nous revoyons les signalements ouverts dans la file d’administration. Ce n’est pas une enquête de protection de l’enfance.",
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
