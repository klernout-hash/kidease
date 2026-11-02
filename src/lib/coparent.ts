/**
 * Co-parent linking. The main parent invites one other parent.
 * That person signs in with their own account. They share the main
 * parent's children and the tours, waitlists, messages, and bills
 * tied to that family. The invite is an in-app link. No email. No SMS.
 */

export const COPARENT_FLAG = "FEATURE_COPARENT_LINK";
export const VIEW_ONLY_MESSAGE = "You can look at this family. You cannot change it.";

export const SHARED_RECORD_KINDS = ["children", "tours", "waitlists", "messages", "invoices"] as const;
export type SharedRecordKind = (typeof SHARED_RECORD_KINDS)[number];

export type CoparentAccess = "full" | "view";
export type CoparentStatus = "pending" | "active" | "removed";

export type CoparentLink = {
  id: string;
  ownerUserId: string;
  memberUserId: string | null;
  access: CoparentAccess;
  status: CoparentStatus;
  inviteToken: string;
};

export type FamilyScope = {
  actorId: string;
  dataUserId: string;
  access: "owner" | "full" | "view";
  canWrite: boolean;
  linked: boolean;
};

export function parseAccess(value: unknown): CoparentAccess | null {
  return value === "full" || value === "view" ? value : null;
}

export function tokenOk(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,80}$/.test(token);
}

/** In-app path only. Nothing is emailed or texted. */
export function invitePath(token: string, deskPath: "/parent" | "/fr/parent" = "/parent"): string {
  return `${deskPath}?tab=family&invite=${encodeURIComponent(token)}`;
}

export function scopeFromLinks(actorId: string, links: readonly CoparentLink[], enabled: boolean): FamilyScope {
  const self: FamilyScope = {
    actorId,
    dataUserId: actorId,
    access: "owner",
    canWrite: true,
    linked: false,
  };
  if (!enabled || !actorId) return self;
  const active = links.filter((link) => link.status === "active");
  const asMember = active.find((link) => link.memberUserId === actorId);
  if (asMember) {
    return {
      actorId,
      dataUserId: asMember.ownerUserId,
      access: asMember.access,
      canWrite: asMember.access === "full",
      linked: true,
    };
  }
  const asOwner = active.some((link) => link.ownerUserId === actorId);
  return { ...self, linked: asOwner };
}

/** A family record is shared when it belongs to the main parent. */
export function recordOnFamily(scope: FamilyScope, recordUserId: string): boolean {
  return Boolean(recordUserId) && recordUserId === scope.dataUserId;
}

export function decideAccept(input: {
  actorId: string;
  link: CoparentLink | null;
  actorHasOpenFamily: boolean;
}): { ok: true } | { ok: false; error: "missing" | "closed" | "self" | "busy" } {
  if (!input.actorId || !input.link || !tokenOk(input.link.inviteToken)) return { ok: false, error: "missing" };
  if (input.link.status !== "pending" || input.link.memberUserId) return { ok: false, error: "closed" };
  if (input.actorId === input.link.ownerUserId) return { ok: false, error: "self" };
  if (input.actorHasOpenFamily) return { ok: false, error: "busy" };
  return { ok: true };
}

export function canRemoveLink(actorId: string, link: CoparentLink | null): boolean {
  if (!link || link.ownerUserId !== actorId) return false;
  return link.status === "pending" || link.status === "active";
}

export function canSetAccess(actorId: string, link: CoparentLink | null, access: CoparentAccess | null): boolean {
  if (!access || !link || link.ownerUserId !== actorId) return false;
  return link.status === "pending" || link.status === "active";
}
