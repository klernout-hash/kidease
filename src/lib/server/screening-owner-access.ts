import { setResponseStatus } from "@tanstack/react-start/server";
import { centreCanManageScreening } from "@/lib/provider-screening";
import type { Sql } from "@/lib/db";
import { loadCentreRole } from "@/lib/server/centre-access";

export function screeningOwnerDenied(): Error & { status: number } {
  return Object.assign(new Error("This tab is for the centre owner."), { status: 403 });
}

export async function requireScreeningOwner(sql: Sql, userId: string, daycareId: string) {
  if (!centreCanManageScreening(await loadCentreRole(sql, userId, daycareId)))
    throw screeningOwnerDenied();
}

export async function screeningOwnerCentreIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ id: string }>`
    select d.id from daycares d
    where exists (
      select 1 from provider_daycares p
      where p.daycare_id = d.id and p.user_id = ${userId}
    ) or exists (
      select 1 from centre_members m
      where m.daycare_id = d.id and m.user_id = ${userId}
        and m.status = 'active' and m.role = 'owner'
    )
    order by d.name
  `;
  if (!rows.length) throw screeningOwnerDenied();
  return rows.map((row) => row.id);
}

export async function screeningServerFn<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 403) setResponseStatus(403);
    throw error;
  }
}
