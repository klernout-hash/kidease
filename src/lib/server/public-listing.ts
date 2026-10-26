import { getSessionUser } from "@/lib/auth/verify.server";
import { resolveAdminAccess } from "@/lib/server/roles";

export async function callerIsAdmin(bearerToken?: string) {
  try {
    const user = await getSessionUser(bearerToken);
    if (!user) return false;
    return (await resolveAdminAccess(user.id)).ok;
  } catch {
    return false;
  }
}

/** The signed-in daycare owner or an active staff member of this centre. */
export async function callerOwnsDaycare(daycareId: string, bearerToken?: string) {
  const id = String(daycareId || "").trim();
  if (!id) return false;
  try {
    const user = await getSessionUser(bearerToken);
    if (!user) return false;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ ok: number }>`
      select 1 as ok
      where exists (
        select 1 from provider_daycares pd
        where pd.user_id = ${user.id} and pd.daycare_id = ${id}
      ) or exists (
        select 1 from centre_members m
        where m.user_id = ${user.id} and m.daycare_id = ${id} and m.status = 'active'
      )
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Admin, or the centre's own daycare account, may open a hidden listing. */
export async function callerMayViewHiddenListing(daycareId: string, bearerToken?: string) {
  if (await callerIsAdmin(bearerToken)) return true;
  return callerOwnsDaycare(daycareId, bearerToken);
}

/** profiles.is_test. Accepts the int column and a boolean from a driver. */
export function profileIsTestAccount(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

/** Signed-in profile flagged as a test account. Fail closed. */
export async function callerIsTestAccount(bearerToken?: string): Promise<boolean> {
  try {
    const user = await getSessionUser(bearerToken);
    if (!user) return false;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ is_test: number | boolean | string | null }>`
      select is_test from profiles where user_id = ${user.id} limit 1
    `;
    return profileIsTestAccount(rows[0]?.is_test);
  } catch {
    return false;
  }
}

/**
 * Admin, or a flagged test account, may message, save, tour, and request a
 * spot on a hidden test listing. Claim checks stay admin-only.
 */
export async function callerMayUseAdminOnlyListing(bearerToken?: string): Promise<boolean> {
  if (await callerIsAdmin(bearerToken)) return true;
  return callerIsTestAccount(bearerToken);
}
