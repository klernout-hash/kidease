import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  accountSectionHiddenForStaff,
  OPEN_ACCOUNT_SCOPE,
  STAFF_ACCOUNT_ACTION_DENIED,
  staffOnlyAccount,
  type StaffAccountScope,
  type StaffHiddenAccountSection,
} from "@/lib/staff-permissions";

/**
 * N-43: is this login staff-only on a centre account? Same rule as the Account page (accountSectionHiddenForStaff).
 * Server functions for delete, export, wallet, refer and upgrade call
 * assertStaffAccountAction, so hiding the buttons is not the only lock.
 */
export async function loadStaffAccountScope(userId: string): Promise<StaffAccountScope> {
  const sql = await getSql();
  const [profile, owned, members] = await Promise.all([
    sql<{ role: string | null }>`select role from profiles where user_id = ${userId} limit 1`,
    sql<{ ok: number }>`select 1 as ok from provider_daycares where user_id = ${userId} limit 1`,
    sql<{ role: string | null; permission_preset: string | null }>`
      select role, permission_preset
      from centre_members
      where user_id = ${userId} and status = 'active'
    `,
  ]);
  if (owned.length || !members.length) return OPEN_ACCOUNT_SCOPE;
  const { maxCentreRole, parseCentreMemberRole } = await import("@/lib/centre-roles");
  const centreRole = maxCentreRole(members.map((row) => parseCentreMemberRole(row.role)));
  // Same as roles.ts loadRoleChrome: a manager can invite, so is not staff-only.
  const centreCanInvite = members.some((row) => row.role === "manager" || row.permission_preset === "manager");
  const staffOnly = staffOnlyAccount({ profileRole: profile[0]?.role ?? null, centreOwner: false, centreRole, centreCanInvite });
  if (!staffOnly) return OPEN_ACCOUNT_SCOPE;
  return { staffOnly: true };
}

export class StaffAccountActionError extends Error {
  readonly status = 403;
  constructor() {
    super(STAFF_ACCOUNT_ACTION_DENIED);
    this.name = "StaffAccountActionError";
  }
}

export async function assertStaffAccountAction(userId: string, action: StaffHiddenAccountSection): Promise<void> {
  const scope = await loadStaffAccountScope(userId);
  if (accountSectionHiddenForStaff(action, scope)) throw new StaffAccountActionError();
}

/** For the Account page: which sections to hide. */
export const getStaffAccountScope = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => loadStaffAccountScope(context.userId));
