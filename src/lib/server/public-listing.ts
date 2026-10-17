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
