import type { Sql } from "@/lib/db";
import { LISTING_NOT_YOURS } from "@/lib/access-control";
import {
  centreCanMutateListingDetails,
  centreCanMutateVacancies,
  centreCanWriteLeads,
  parseCentreMemberRole,
  type CentreMemberRole,
} from "@/lib/centre-roles";
import { nid } from "@/lib/utils";

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

export async function canCentreWriteLeadsFor(
  sql: Sql,
  userId: string,
  daycareId: string,
): Promise<boolean> {
  return centreCanWriteLeads(await loadCentreRole(sql, userId, daycareId));
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
