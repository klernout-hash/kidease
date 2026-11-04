/**
 * Custody rules for a second parent.
 * The invite stays pending until that person accepts with their own login.
 * A daycare confirms them before pickup or the child file.
 * A restriction is visible only to that daycare and to KidEase admin.
 */

import { decideAccept, tokenOk, type CoparentLink } from "./coparent.ts";
import { messageIsBlocked, type SafetyBlock } from "./safety.ts";

export const COPARENT_EMAIL_FLAG = "FEATURE_COPARENT_EMAIL";
export const INVITE_DAYS = 7;
export const INVITE_TTL_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;

export const AUDIT_ACTIONS = [
  "invite",
  "accept",
  "revoke",
  "verify",
  "restriction",
  "restriction_lift",
  "pickup_change",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type RestrictionMode = "restrict" | "block";

export type InviteLink = CoparentLink & {
  inviteEmail?: string | null;
  expiresAt?: string | null;
};

export function inviteExpiry(now = new Date()) {
  return new Date(now.getTime() + INVITE_TTL_MS).toISOString();
}

export function inviteCreatesPending(row: { status: string; memberUserId: string | null }) {
  return row.status === "pending" && !row.memberUserId;
}

type EnvLike = Record<string, string | undefined>;

function truthy(value: string | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Production only. Tests, CI, and preview never send. */
export function coparentMailPlan(input: { enabled: boolean; env?: EnvLike }): "send" | "skip_flag" | "skip_test" | "skip_preview" {
  if (!input.enabled) return "skip_flag";
  const env = input.env ?? {};
  const node = String(env.NODE_ENV || "").toLowerCase();
  const vercel = String(env.VERCEL_ENV || "").toLowerCase();
  if (node === "test" || truthy(env.VITEST) || truthy(env.CI)) return "skip_test";
  if (vercel !== "production") return "skip_preview";
  return "send";
}

export function emailsMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a) && a === b;
}

export function decideEmailAccept(input: {
  actorId: string;
  actorEmail: string;
  link: InviteLink | null;
  actorHasOpenFamily: boolean;
  pairBlocked: boolean;
  now?: Date;
}): { ok: true } | { ok: false; error: "missing" | "closed" | "self" | "busy" | "expired" | "email" | "blocked" } {
  if (!input.link || !tokenOk(input.link.inviteToken)) return { ok: false, error: "missing" };
  const base = decideAccept({
    actorId: input.actorId,
    link: input.link,
    actorHasOpenFamily: input.actorHasOpenFamily,
  });
  if (!base.ok) return base;
  if (input.pairBlocked) return { ok: false, error: "blocked" };
  if (input.link.expiresAt) {
    const expires = new Date(input.link.expiresAt).getTime();
    const now = (input.now ?? new Date()).getTime();
    if (!Number.isFinite(expires) || expires <= now) return { ok: false, error: "expired" };
  }
  if (input.link.inviteEmail && !emailsMatch(input.actorEmail, input.link.inviteEmail)) {
    return { ok: false, error: "email" };
  }
  return { ok: true };
}

export function pairBlocked(blocks: readonly SafetyBlock[], left: string, right: string) {
  if (!left || !right || left === right) return false;
  return blocks.some(
    (block) =>
      (block.blockerUserId === left && block.blockedUserId === right) ||
      (block.blockerUserId === right && block.blockedUserId === left),
  );
}

export function anyGuardianBlocked(input: {
  guardianIds: readonly string[];
  daycareId: string;
  centreUserIds: readonly string[];
  blocks: readonly SafetyBlock[];
}) {
  return input.guardianIds.some((id) =>
    messageIsBlocked({
      senderId: id,
      parentUserId: id,
      daycareId: input.daycareId,
      centreUserIds: input.centreUserIds,
      blocks: input.blocks,
    }),
  );
}

export function guardianCentreAccess(input: {
  verified: boolean;
  restriction: RestrictionMode | null;
}): { portfolio: boolean; pickup: boolean; messaging: boolean } {
  if (input.restriction === "block") return { portfolio: false, pickup: false, messaging: false };
  if (input.restriction === "restrict") return { portfolio: false, pickup: false, messaging: true };
  if (!input.verified) return { portfolio: false, pickup: false, messaging: true };
  return { portfolio: true, pickup: true, messaging: true };
}

export function guardianNotifyIds(ownerId: string, memberId: string | null | undefined) {
  return [...new Set([ownerId, memberId].map((id) => String(id || "").trim()).filter(Boolean))];
}

export function canSeeCustodyRecord(input: {
  viewerIsAdmin: boolean;
  viewerDaycareIds: readonly string[];
  recordDaycareId: string;
}) {
  if (!input.recordDaycareId) return false;
  if (input.viewerIsAdmin) return true;
  return input.viewerDaycareIds.includes(input.recordDaycareId);
}

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export type FamilyNoticeKind = "invite" | "linked" | "unlinked" | "pickups";

const NOTICE = {
  en: {
    invite: {
      subject: "You are invited to a KidEase family",
      text: "A parent invited you to share their KidEase family. Sign in with this email and accept the invite. It expires in 7 days. We do not accept it for you.",
    },
    linked: {
      subject: "A parent joined your KidEase family",
      text: "The other parent accepted the invite with their own login. A daycare still has to confirm them before pickup or the child file.",
    },
    unlinked: {
      subject: "A parent was removed from your KidEase family",
      text: "The family link was removed. That login no longer shares this family.",
    },
    pickups: {
      subject: "Pickup people were updated on KidEase",
      text: "Authorized pickup people on your family were updated.",
    },
  },
  fr: {
    invite: {
      subject: "Invitation à une famille KidEase",
      text: "Un parent vous invite à partager sa famille KidEase. Connectez-vous avec ce courriel et acceptez l’invitation. Elle expire dans 7 jours. Nous ne l’acceptons pas à votre place.",
    },
    linked: {
      subject: "Un parent a rejoint votre famille KidEase",
      text: "L’autre parent a accepté l’invitation avec son propre compte. La garderie doit encore le confirmer avant le départ ou le dossier de l’enfant.",
    },
    unlinked: {
      subject: "Un parent a été retiré de votre famille KidEase",
      text: "Le lien familial a été retiré. Ce compte ne partage plus cette famille.",
    },
    pickups: {
      subject: "Les personnes autorisées ont changé sur KidEase",
      text: "Les personnes autorisées à venir chercher l’enfant ont été mises à jour.",
    },
  },
} as const;

export function familyNotice(locale: string, kind: FamilyNoticeKind) {
  const pack = locale === "fr" ? NOTICE.fr : NOTICE.en;
  return pack[kind];
}
