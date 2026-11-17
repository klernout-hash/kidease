/**
 * Profile health from the database. One loader for the Approve guard and the
 * daycare's own desk; the admin queue scores the same columns with the same
 * function (healthFromDaycareRow), so all three agree.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { healthFromDaycareRow } from "@/lib/profile-health-row";
import { profileHealth, type DaycareHealthRow, type ProfileHealth } from "@/lib/profile-health";
import { hasCentreDeskAccess } from "@/lib/server/centre-access";

export async function loadDaycareHealth(sql: Sql, daycareId: string): Promise<ProfileHealth> {
  // Licence file: the claim's upload wins, same as the admin queue.
  const rows = await sql<DaycareHealthRow>`
    select d.photos, d.license_number, d.license_status, d.license_expiry::text as license_expiry,
      d.registry_match_state,
      coalesce(
        nullif(btrim((
          select c.license_photo from listing_claims c
          where c.daycare_id = d.id
          order by
            case
              when c.status in ('waiting', 'pending', 'verified') then 0
              when c.status = 'approved' then 1
              when c.status = 'superseded' then 3
              else 2
            end,
            c.created_at desc nulls last
          limit 1
        )), ''),
        nullif(btrim(d.license_photo), '')
      ) as license_photo,
      d.screening_on_file, d.staff_screening_attested, d.province,
      d.infant_monthly, d.toddler_monthly, d.preschool_monthly, d.part_time_monthly,
      d.ages_confirmed, d.age_min_months, d.age_max_months, d.hours, d.phone, d.contact_email, d.address
    from daycares d where d.id = ${daycareId} limit 1
  `;
  return rows[0] ? healthFromDaycareRow(rows[0]) : profileHealth({});
}

/** The daycare desk: the same score Admin sees, for a centre this person works at. */
export const loadMyListingHealth = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => ({ daycareId: String(input?.daycareId || "").trim().slice(0, 80) }))
  .handler(async ({ context, data }): Promise<{ ok: true; health: ProfileHealth } | { ok: false }> => {
    if (!data.daycareId) return { ok: false };
    const sql = await getSql();
    if (!(await hasCentreDeskAccess(sql, context.userId, data.daycareId))) return { ok: false };
    return { ok: true, health: await loadDaycareHealth(sql, data.daycareId) };
  });
