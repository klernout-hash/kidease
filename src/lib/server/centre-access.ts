import type { Sql } from "@/lib/db";
import { LISTING_NOT_YOURS } from "@/lib/access-control";
import {
  canWrite,
  centreActionAllowed,
  centreActionDenied,
  centreCanMutateListingDetails,
  centreCanMutateVacancies,
  parseCentreMemberRole,
  type CentreGate,
  type CentreMemberRole,
  type CentreWriteAction,
} from "@/lib/centre-roles";
import {
  STAFF_AREA_DENIED,
  areaForWriteAction,
  decideBillsList,
  decideStaffArea,
  type AreaDenial,
  type MemberAccess,
  type StaffArea,
} from "@/lib/staff-permissions";
import { nid } from "@/lib/utils";

export type CentreAction = CentreGate;
export { canWrite, centreActionAllowed, centreActionDenied };

export async function listOwnedDaycareIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from provider_daycares where user_id = ${userId}
  `.catch(() => []);
  return rows.map((r) => r.daycare_id);
}

export async function listMemberDaycareIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from centre_members
    where user_id = ${userId} and status = 'active'
  `.catch(() => []);
  return rows.map((r) => r.daycare_id);
}

/** Owner rows plus active employee memberships. */
export async function listAccessibleDaycareIds(sql: Sql, userId: string): Promise<string[]> {
  const [owned, members] = await Promise.all([
    listOwnedDaycareIds(sql, userId),
    listMemberDaycareIds(sql, userId),
  ]);
  return [...new Set([...owned, ...members])];
}

export async function loadCentreRole(
  sql: Sql,
  userId: string,
  daycareId: string,
): Promise<CentreMemberRole | null> {
  const owned = await sql<{ user_id: string }>`
    select user_id from provider_daycares
    where user_id = ${userId} and daycare_id = ${daycareId}
    limit 1
  `.catch(() => []);
  if (owned[0]) return "owner";
  const member = await sql<{ role: string }>`
    select role from centre_members
    where user_id = ${userId} and daycare_id = ${daycareId} and status = 'active'
    limit 1
  `.catch(() => []);
  return parseCentreMemberRole(member[0]?.role);
}

export async function assertCentreCanMutateListing(sql: Sql, userId: string, daycareId: string) {
  const role = await loadCentreRole(sql, userId, daycareId);
  if (!centreCanMutateListingDetails(role)) throw new Error(LISTING_NOT_YOURS);
}

export async function assertCentreCanMutateVacancies(sql: Sql, userId: string, daycareId: string) {
  const role = await loadCentreRole(sql, userId, daycareId);
  if (!centreCanMutateVacancies(role)) throw new Error(LISTING_NOT_YOURS);
}

export async function hasCentreDeskAccess(sql: Sql, userId: string, daycareId: string): Promise<boolean> {
  return (await loadCentreRole(sql, userId, daycareId)) !== null;
}

export async function listMemberGrants(sql: Sql, userId: string): Promise<MemberAccess[]> {
  const rich = await sql<{
    daycare_id: string;
    role: string;
    permission_preset: string | null;
    permissions: unknown;
  }>`
    select daycare_id, role, permission_preset, permissions
    from centre_members
    where user_id = ${userId} and status = 'active'
  `.catch(() => null);
  if (rich) {
    return rich.map((row) => ({
      daycareId: row.daycare_id,
      role: row.role,
      preset: row.permission_preset,
      permissions: row.permissions,
    }));
  }
  const plain = await sql<{ daycare_id: string; role: string }>`
    select daycare_id, role from centre_members
    where user_id = ${userId} and status = 'active'
  `.catch(() => []);
  return plain.map((row) => ({
    daycareId: row.daycare_id,
    role: row.role,
    preset: null,
    permissions: null,
  }));
}

async function centreActor(sql: Sql, userId: string, daycareId: string) {
  const [owned, memberships, admin] = await Promise.all([
    listOwnedDaycareIds(sql, userId),
    listMemberGrants(sql, userId),
    import("@/lib/server/roles").then((mod) => mod.resolveAdminAccess(userId).then((row) => row.ok).catch(() => false)),
  ]);
  return {
    isAdmin: admin,
    ownsTarget: owned.includes(daycareId),
    membership: memberships.find((row) => row.daycareId === daycareId) ?? null,
    hasOtherCentre: owned.some((id) => id !== daycareId) || memberships.some((row) => row.daycareId !== daycareId),
  };
}

export function staffAreaError(decision: AreaDenial): Error & { status: number } {
  const error = new Error(STAFF_AREA_DENIED) as Error & { status: number };
  error.status = decision.status;
  return error;
}

/** 403 when this person cannot view or edit the area at this centre. */
export async function explainStaffArea(
  sql: Sql,
  userId: string,
  daycareId: string,
  area: StaffArea,
  need: "view" | "edit",
) {
  const actor = await centreActor(sql, userId, daycareId);
  return decideStaffArea({ ...actor, area, need });
}

export async function assertStaffArea(
  sql: Sql,
  userId: string,
  daycareId: string,
  area: StaffArea,
  need: "view" | "edit",
): Promise<void> {
  const decision = await explainStaffArea(sql, userId, daycareId, area, need);
  if (!decision.ok) throw staffAreaError(decision);
}

/** Centres where this person may see an area. Owners are included for every grantable area. */
export async function daycareIdsForArea(
  sql: Sql,
  userId: string,
  area: StaffArea,
  need: "view" | "edit",
): Promise<string[]> {
  const [owned, memberships, admin] = await Promise.all([
    listOwnedDaycareIds(sql, userId),
    listMemberGrants(sql, userId),
    import("@/lib/server/roles").then((mod) => mod.resolveAdminAccess(userId).then((row) => row.ok).catch(() => false)),
  ]);
  if (admin) return [...new Set([...owned, ...memberships.map((row) => row.daycareId)])];
  const decision = decideBillsList({ ownedIds: owned, memberships });
  if (area === "bills") return decision.ok ? decision.daycareIds : [];
  const ids = new Set<string>(owned);
  for (const row of memberships) {
    const gate = decideStaffArea({
      ownsTarget: false,
      membership: row,
      hasOtherCentre: false,
      area,
      need,
    });
    if (gate.ok) ids.add(row.daycareId);
  }
  return [...ids];
}

export async function explainBillsList(sql: Sql, userId: string) {
  const [owned, memberships, admin] = await Promise.all([
    listOwnedDaycareIds(sql, userId),
    listMemberGrants(sql, userId),
    import("@/lib/server/roles").then((mod) => mod.resolveAdminAccess(userId).then((row) => row.ok).catch(() => false)),
  ]);
  return decideBillsList({ isAdmin: admin, ownedIds: owned, memberships });
}

/** Read-only cannot write. Staff and managers cannot open money or contracts. Admins can. */
export async function assertCentreAction(
  sql: Sql,
  userId: string,
  daycareId: string,
  action: CentreAction,
): Promise<void> {
  const { resolveAdminAccess } = await import("@/lib/server/roles");
  const admin = await resolveAdminAccess(userId)
    .then((row) => row.ok)
    .catch(() => false);
  if (admin) return;
  const role = await loadCentreRole(sql, userId, daycareId);
  if (!centreActionAllowed(role, action)) throw centreActionDenied(action);
}

/** Read-only is 403. Staff and managers may do floor work. Admins may. */
export async function assertCanWrite(
  sql: Sql,
  userId: string,
  daycareId: string,
  action: CentreWriteAction,
): Promise<void> {
  const { resolveAdminAccess } = await import("@/lib/server/roles");
  const admin = await resolveAdminAccess(userId)
    .then((row) => row.ok)
    .catch(() => false);
  if (admin) return;
  if (action === "contracts") {
    const role = await loadCentreRole(sql, userId, daycareId);
    if (!canWrite(role, action)) throw centreActionDenied("contracts");
    return;
  }
  const area = areaForWriteAction(action);
  if (area) {
    await assertStaffArea(sql, userId, daycareId, area, "edit");
    return;
  }
  const role = await loadCentreRole(sql, userId, daycareId);
  if (!canWrite(role, action)) throw centreActionDenied("write");
}

export async function canCentreWriteLeadsFor(
  sql: Sql,
  userId: string,
  daycareId: string,
): Promise<boolean> {
  const decision = await explainStaffArea(sql, userId, daycareId, "requests", "edit");
  return decision.ok;
}

export async function isActiveCentreMember(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from centre_members
    where user_id = ${userId} and status = 'active'
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

export async function ensureOwnerMembership(sql: Sql, userId: string, daycareId: string) {
  const existing = await sql<{ id: string }>`
    select id from centre_members
    where user_id = ${userId} and daycare_id = ${daycareId}
    limit 1
  `.catch(() => []);
  if (existing[0]) {
    await sql`
      update centre_members
      set role = 'owner', status = 'active', revoked_at = null, revoked_by = null
      where id = ${existing[0].id}
    `.catch(() => undefined);
    return;
  }
  await sql`
    insert into centre_members (id, daycare_id, user_id, role, status)
    values (${nid("cm")}, ${daycareId}, ${userId}, 'owner', 'active')
  `.catch(() => undefined);
}
