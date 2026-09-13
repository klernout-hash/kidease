/**
 * Per-centre daycare desk roles. Fail closed: only Owner may touch
 * Money / Contracts / billing / licence claim transfer / invite-revoke.
 * Staff get leads, inbox, and vacancies. Read-only may view, not write.
 */

export const CENTRE_MEMBER_ROLES = ["owner", "manager", "staff", "read_only"] as const;
export type CentreMemberRole = (typeof CENTRE_MEMBER_ROLES)[number];

export const CENTRE_INVITE_ROLES = ["manager", "staff", "read_only"] as const;
export type CentreInviteRole = (typeof CENTRE_INVITE_ROLES)[number];

export const CENTRE_MEMBER_STATUSES = ["active", "revoked"] as const;
export type CentreMemberStatus = (typeof CENTRE_MEMBER_STATUSES)[number];

export const CENTRE_INVITE_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export type CentreInviteStatus = (typeof CENTRE_INVITE_STATUSES)[number];

/** Soft invite caps — owner can retry after the window. */
export const CENTRE_INVITE_HOURLY_MAX = 8;
export const CENTRE_INVITE_DAILY_MAX = 20;
export const CENTRE_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const CENTRE_INVITE_RATE_LIMITED =
  "Too many employee invites just now. Wait an hour, then try again.";
export const CENTRE_INVITE_NOT_OWNER = "Only the centre owner can invite or revoke employees.";
export const CENTRE_INVITE_BAD_EMAIL = "Enter a valid work email.";
export const CENTRE_INVITE_SELF = "You cannot invite your own login.";
export const CENTRE_INVITE_DUPLICATE = "That email already has access or a pending invite.";
export const CENTRE_INVITE_NOT_FOUND = "This invite is no longer valid.";
export const CENTRE_INVITE_EMAIL_MISMATCH =
  "Sign in with the email this invite was sent to.";
export const CENTRE_STAFF_FORBIDDEN =
  "Staff cannot open Money, contracts, billing, or licence claim.";
export const CENTRE_REVOKE_OWNER = "The centre owner cannot be revoked from this list.";

export function isCentreMemberRole(value: string | null | undefined): value is CentreMemberRole {
  return (CENTRE_MEMBER_ROLES as readonly string[]).includes((value || "").trim());
}

export function isCentreInviteRole(value: string | null | undefined): value is CentreInviteRole {
  return (CENTRE_INVITE_ROLES as readonly string[]).includes((value || "").trim());
}

export function parseCentreMemberRole(value: string | null | undefined): CentreMemberRole | null {
  const v = (value || "").trim();
  return isCentreMemberRole(v) ? v : null;
}

export function parseCentreInviteRole(value: string | null | undefined): CentreInviteRole {
  const v = (value || "").trim();
  return isCentreInviteRole(v) ? v : "staff";
}

/** Highest privilege wins when a session covers several centres. */
export function rankCentreRole(role: CentreMemberRole | null | undefined): number {
  if (role === "owner") return 4;
  if (role === "manager") return 3;
  if (role === "staff") return 2;
  if (role === "read_only") return 1;
  return 0;
}

export function maxCentreRole(
  roles: readonly (CentreMemberRole | null | undefined)[],
): CentreMemberRole | null {
  let best: CentreMemberRole | null = null;
  for (const role of roles) {
    if (rankCentreRole(role) > rankCentreRole(best)) best = role ?? null;
  }
  return best;
}

export function centreCanViewDesk(role: CentreMemberRole | null | undefined): boolean {
  return rankCentreRole(role) >= 1;
}

export function centreCanWriteLeads(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export function centreCanWriteInbox(role: CentreMemberRole | null | undefined): boolean {
  return centreCanWriteLeads(role);
}

export function centreCanMutateVacancies(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export function centreCanMutateListingDetails(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function centreCanInviteRevoke(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner";
}

/** Money, bills, Stripe, contracts, licence, claim transfer, subscription, Promote. */
export function centreCanAccessPrivileged(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner";
}

export function centreCanCreateListing(input: {
  ownerCount: number;
  memberOnly: boolean;
}): boolean {
  if (input.memberOnly) return false;
  return true;
}

export type CentreDeskCaps = {
  money: boolean;
  contract: boolean;
  licence: boolean;
  promote: boolean;
  subscription: boolean;
  addListing: boolean;
  claim: boolean;
  employees: boolean;
  vacancies: boolean;
  leadsWrite: boolean;
};

export function centreDeskCaps(role: CentreMemberRole | null | undefined): CentreDeskCaps {
  const owner = centreCanAccessPrivileged(role);
  return {
    money: owner,
    contract: owner,
    licence: owner,
    promote: owner,
    subscription: owner,
    addListing: owner,
    claim: owner,
    employees: owner,
    vacancies: centreCanMutateVacancies(role),
    leadsWrite: centreCanWriteLeads(role),
  };
}

export function sessionCentreCaps(input: {
  isOwner: boolean;
  isMember: boolean;
  isAdmin?: boolean;
}): CentreDeskCaps {
  if (input.isAdmin) return centreDeskCaps("owner");
  if (input.isOwner) return centreDeskCaps("owner");
  if (input.isMember) return centreDeskCaps("staff");
  return centreDeskCaps(null);
}

export function decideInviteEmployee(input: {
  actorRole: CentreMemberRole | null;
  actorEmail: string;
  inviteEmail: string;
  inviteRole: string;
  alreadyMember: boolean;
  pendingInvite: boolean;
  hourlyCount: number;
  dailyCount: number;
}): { ok: true; role: CentreInviteRole } | { ok: false; error: string } {
  if (!centreCanInviteRevoke(input.actorRole)) {
    return { ok: false, error: CENTRE_INVITE_NOT_OWNER };
  }
  const email = (input.inviteEmail || "").trim().toLowerCase();
  if (!email.includes("@") || email.length < 5 || email.length > 160) {
    return { ok: false, error: CENTRE_INVITE_BAD_EMAIL };
  }
  if (email === (input.actorEmail || "").trim().toLowerCase()) {
    return { ok: false, error: CENTRE_INVITE_SELF };
  }
  if (!isCentreInviteRole(input.inviteRole)) {
    return { ok: false, error: "Pick Manager, Staff, or Read-only." };
  }
  if (input.alreadyMember || input.pendingInvite) {
    return { ok: false, error: CENTRE_INVITE_DUPLICATE };
  }
  if (input.hourlyCount >= CENTRE_INVITE_HOURLY_MAX || input.dailyCount >= CENTRE_INVITE_DAILY_MAX) {
    return { ok: false, error: CENTRE_INVITE_RATE_LIMITED };
  }
  return { ok: true, role: input.inviteRole };
}

export function decideAcceptInvite(input: {
  inviteStatus: string | null;
  inviteEmail: string;
  sessionEmail: string;
  expiresAtMs: number;
  nowMs?: number;
}): { ok: true } | { ok: false; error: string } {
  if (!input.inviteStatus || input.inviteStatus !== "pending") {
    return { ok: false, error: CENTRE_INVITE_NOT_FOUND };
  }
  const now = input.nowMs ?? Date.now();
  if (!Number.isFinite(input.expiresAtMs) || input.expiresAtMs < now) {
    return { ok: false, error: CENTRE_INVITE_NOT_FOUND };
  }
  const invited = (input.inviteEmail || "").trim().toLowerCase();
  const session = (input.sessionEmail || "").trim().toLowerCase();
  if (!invited || !session || invited !== session) {
    return { ok: false, error: CENTRE_INVITE_EMAIL_MISMATCH };
  }
  return { ok: true };
}

export function decideRevokeEmployee(input: {
  actorRole: CentreMemberRole | null;
  targetRole: CentreMemberRole | null;
  targetKind: "member" | "invite";
}): { ok: true } | { ok: false; error: string } {
  if (!centreCanInviteRevoke(input.actorRole)) {
    return { ok: false, error: CENTRE_INVITE_NOT_OWNER };
  }
  if (input.targetKind === "member" && input.targetRole === "owner") {
    return { ok: false, error: CENTRE_REVOKE_OWNER };
  }
  return { ok: true };
}

export function normalizeInviteEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}
