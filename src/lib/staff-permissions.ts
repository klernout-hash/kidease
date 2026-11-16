/**
 * Per-person centre permissions. Owner-only work (payouts, bank details,
 * the contract, the subscription, the licence, the claim, deleting the
 * centre, and editing these permissions) is never a grant.
 * A Manager may invite Staff and Lead. They cannot change permissions.
 */

import {
  CENTRE_INVITE_BAD_EMAIL,
  CENTRE_INVITE_DUPLICATE,
  CENTRE_INVITE_NOT_OWNER,
  CENTRE_INVITE_RATE_LIMITED,
  CENTRE_INVITE_SELF,
  CENTRE_INVITE_HOURLY_MAX,
  CENTRE_INVITE_DAILY_MAX,
  type CentreInviteRole,
  type CentreMemberRole,
} from "./centre-roles.ts";

export const STAFF_AREAS = [
  "bills",
  "messages",
  "children",
  "listing",
  "calendar",
  "schedule",
  "requests",
  "documents",
] as const;

export type StaffArea = (typeof STAFF_AREAS)[number];
export type StaffLevel = "none" | "view" | "edit";
export type StaffGrants = Record<StaffArea, StaffLevel>;
export type StaffPreset = "staff" | "lead" | "manager" | "custom";

export const STAFF_AREA_DENIED = "You do not have access to that.";

const RANK: Record<StaffLevel, number> = { none: 0, view: 1, edit: 2 };

/** What a staff login can do today, including check-in and their own hours. */
export const STAFF_GRANTS: StaffGrants = {
  bills: "none",
  messages: "edit",
  children: "none",
  listing: "view",
  calendar: "edit",
  schedule: "edit",
  requests: "edit",
  documents: "view",
};

/** Staff, plus messages, the calendar, and child records they can view. */
export const LEAD_GRANTS: StaffGrants = {
  ...STAFF_GRANTS,
  messages: "edit",
  calendar: "edit",
  children: "view",
};

/** Every grantable area. Payouts, bank, contract, subscription, licence, and claim stay out. */
export const MANAGER_GRANTS: StaffGrants = {
  bills: "edit",
  messages: "edit",
  children: "edit",
  listing: "edit",
  calendar: "edit",
  schedule: "edit",
  requests: "edit",
  documents: "edit",
};

const READ_ONLY_GRANTS: StaffGrants = {
  bills: "none",
  messages: "view",
  children: "view",
  listing: "view",
  calendar: "view",
  schedule: "view",
  requests: "view",
  documents: "view",
};

export function presetGrants(preset: "staff" | "lead" | "manager"): StaffGrants {
  if (preset === "lead") return { ...LEAD_GRANTS };
  if (preset === "manager") return { ...MANAGER_GRANTS };
  return { ...STAFF_GRANTS };
}

export function parseStaffLevel(value: unknown): StaffLevel | null {
  return value === "none" || value === "view" || value === "edit" ? value : null;
}

export function parseStaffPreset(value: unknown): StaffPreset | null {
  return value === "staff" || value === "lead" || value === "manager" || value === "custom" ? value : null;
}

export function allows(grants: StaffGrants, area: StaffArea, need: "view" | "edit"): boolean {
  return RANK[grants[area]] >= RANK[need];
}

/** Drop unknown keys. Owner-only work is not an area, so it cannot be stored here. */
export function sanitizeGrants(raw: unknown): StaffGrants {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const grants = {} as StaffGrants;
  for (const area of STAFF_AREAS) grants[area] = parseStaffLevel(source[area]) ?? "none";
  return grants;
}

export function grantsForMember(input: {
  role: string | null | undefined;
  preset: string | null | undefined;
  permissions: unknown;
}): StaffGrants {
  const preset = parseStaffPreset(input.preset);
  if (preset === "staff" || preset === "lead" || preset === "manager") return presetGrants(preset);
  if (preset === "custom") return sanitizeGrants(input.permissions);
  const role = (input.role || "").trim();
  if (role === "owner" || role === "manager") return presetGrants("manager");
  if (role === "read_only") return { ...READ_ONLY_GRANTS };
  return presetGrants("staff");
}

export function mergeGrants(rows: readonly StaffGrants[]): StaffGrants {
  const grants = {} as StaffGrants;
  for (const area of STAFF_AREAS) grants[area] = "none";
  for (const row of rows) {
    for (const area of STAFF_AREAS) {
      if (RANK[row[area]] > RANK[grants[area]]) grants[area] = row[area];
    }
  }
  return grants;
}

export function roleForPreset(preset: StaffPreset, current: string): "manager" | "staff" | "read_only" {
  if (preset === "manager") return "manager";
  if (preset === "staff" || preset === "lead") return "staff";
  if (current === "manager" || current === "read_only") return current;
  return "staff";
}

export function permissionChangeDetail(input: {
  presetFrom: string;
  presetTo: string;
  before: StaffGrants;
  after: StaffGrants;
}): string {
  const parts: string[] = [];
  if (input.presetFrom !== input.presetTo) parts.push(`preset ${input.presetFrom}->${input.presetTo}`);
  for (const area of STAFF_AREAS) {
    if (input.before[area] !== input.after[area]) parts.push(`${area} ${input.before[area]}->${input.after[area]}`);
  }
  const text = parts.join("; ");
  return text.slice(0, 240);
}

export type MemberAccess = {
  daycareId: string;
  role: string;
  preset: string | null;
  permissions: unknown;
};

export type AreaDenial = { ok: false; status: 403; reason: "absent" | "cross_centre" | "permission" };

export function decideStaffArea(input: {
  isAdmin?: boolean;
  ownsTarget: boolean;
  membership: MemberAccess | null;
  hasOtherCentre: boolean;
  area: StaffArea;
  need: "view" | "edit";
}): { ok: true } | AreaDenial {
  if (input.isAdmin || input.ownsTarget) return { ok: true };
  if (!input.membership) {
    return input.hasOtherCentre
      ? { ok: false, status: 403, reason: "cross_centre" }
      : { ok: false, status: 403, reason: "absent" };
  }
  const grants = grantsForMember(input.membership);
  if (!allows(grants, input.area, input.need)) return { ok: false, status: 403, reason: "permission" };
  return { ok: true };
}

/** Centre bills list. A staff login with no Bills access is 403. A stranger is absent. */
export function decideBillsList(input: {
  isAdmin?: boolean;
  ownedIds: readonly string[];
  memberships: readonly MemberAccess[];
}): { ok: true; daycareIds: string[] } | { ok: false; status: 403; reason: "permission" | "absent" } {
  const ids = new Set<string>(input.ownedIds);
  for (const row of input.memberships) {
    if (input.isAdmin || allows(grantsForMember(row), "bills", "view")) ids.add(row.daycareId);
  }
  if (ids.size > 0) return { ok: true, daycareIds: [...ids] };
  if (!input.isAdmin && input.memberships.length > 0) return { ok: false, status: 403, reason: "permission" };
  return { ok: false, status: 403, reason: "absent" };
}

export function decideBillsDaycare(input: {
  isAdmin?: boolean;
  ownsTarget: boolean;
  membership: MemberAccess | null;
  hasOtherCentre: boolean;
  need: "view" | "edit";
}): { ok: true } | AreaDenial {
  return decideStaffArea({ ...input, area: "bills" });
}

/** Sidebar and phone items that follow a grant. Care check-in stays on the floor, not here. */
export const NAV_GRANT: Partial<Record<string, StaffArea>> = {
  money: "bills",
  messages: "messages",
  listings: "listing",
  calendar: "calendar",
  hours: "schedule",
  requests: "requests",
  tours: "requests",
  leads: "requests",
  "centre-documents": "documents",
};

export function navGrantAllows(grants: StaffGrants | null | undefined, id: string): boolean {
  const area = NAV_GRANT[id];
  if (!area || !grants) return true;
  return allows(grants, area, "view");
}

export function areaForWriteAction(action: string): StaffArea | null {
  if (action === "document_upload") return "documents";
  if (action === "listing") return "listing";
  if (action === "calendar" || action === "vacancy") return "calendar";
  if (action === "leads" || action === "waitlist_notify") return "requests";
  if (action === "clock_in") return "schedule";
  return null;
}

export type InviteChoice = "staff" | "lead" | "manager" | "read_only";

export function parseInviteChoice(preset: string | null | undefined, role: string | null | undefined): InviteChoice {
  const picked = (preset || "").trim();
  if (picked === "staff" || picked === "lead" || picked === "manager" || picked === "read_only") return picked;
  const stored = (role || "").trim();
  if (stored === "manager" || stored === "read_only" || stored === "staff") return stored;
  return "staff";
}

/**
 * Owner invites Staff, Lead, Manager, or Read-only.
 * A Manager may invite Staff and Lead only.
 */
export function decideCentreInvite(input: {
  actorRole: CentreMemberRole | null;
  actorEmail: string;
  inviteEmail: string;
  preset?: string | null;
  role?: string | null;
  alreadyMember: boolean;
  pendingInvite: boolean;
  hourlyCount: number;
  dailyCount: number;
}): { ok: true; role: CentreInviteRole; preset: "staff" | "lead" | "manager" | null } | { ok: false; error: string } {
  const choice = parseInviteChoice(input.preset, input.role);
  if (input.actorRole === "manager") {
    if (choice !== "staff" && choice !== "lead") return { ok: false, error: CENTRE_INVITE_NOT_OWNER };
  } else if (input.actorRole !== "owner") {
    return { ok: false, error: CENTRE_INVITE_NOT_OWNER };
  }
  const email = (input.inviteEmail || "").trim().toLowerCase();
  if (!email.includes("@") || email.length < 5 || email.length > 160) return { ok: false, error: CENTRE_INVITE_BAD_EMAIL };
  if (email === (input.actorEmail || "").trim().toLowerCase()) return { ok: false, error: CENTRE_INVITE_SELF };
  if (input.alreadyMember || input.pendingInvite) return { ok: false, error: CENTRE_INVITE_DUPLICATE };
  if (input.hourlyCount >= CENTRE_INVITE_HOURLY_MAX || input.dailyCount >= CENTRE_INVITE_DAILY_MAX) {
    return { ok: false, error: CENTRE_INVITE_RATE_LIMITED };
  }
  if (choice === "manager") return { ok: true, role: "manager", preset: "manager" };
  if (choice === "read_only") return { ok: true, role: "read_only", preset: null };
  if (choice === "lead") return { ok: true, role: "staff", preset: "lead" };
  return { ok: true, role: "staff", preset: "staff" };
}

export function decidePermissionUpdate(input: {
  actorIsOwner: boolean;
  targetRole: string | null;
  preset: string;
  grants: unknown;
}): { ok: true; preset: StaffPreset; grants: StaffGrants; role: "manager" | "staff" | "read_only" } | { ok: false; error: string } {
  if (!input.actorIsOwner) return { ok: false, error: "Only the centre owner can change what staff can open." };
  if (input.targetRole === "owner") return { ok: false, error: "The centre owner keeps full access." };
  const preset = parseStaffPreset(input.preset);
  if (!preset) return { ok: false, error: "Pick Staff, Lead, Manager, or a custom mix." };
  const grants = preset === "custom" ? sanitizeGrants(input.grants) : presetGrants(preset);
  return { ok: true, preset, grants, role: roleForPreset(preset, input.targetRole || "staff") };
}
