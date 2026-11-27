import { setResponseStatus } from "@tanstack/react-start/server";
import { centreCanCreateListing } from "@/lib/centre-roles";
import type { Sql } from "@/lib/db";

/** A first-time operator can add or claim a centre. Staff-only seats cannot. */
export async function assertListingOperator(sql: Sql, userId: string, message: string) {
  const [actor] = await sql<{ is_owner: boolean; is_member: boolean }>`
    select (
      exists (select 1 from provider_daycares where user_id = ${userId})
      or exists (select 1 from centre_members where user_id = ${userId} and status = 'active' and role = 'owner')
    ) as is_owner,
    exists (select 1 from centre_members where user_id = ${userId} and status = 'active') as is_member
  `;
  if (actor && centreCanCreateListing({ ownerCount: actor.is_owner ? 1 : 0, memberOnly: actor.is_member && !actor.is_owner })) return;
  setResponseStatus(403);
  throw Object.assign(new Error(message), { status: 403 });
}
