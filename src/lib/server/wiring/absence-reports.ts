import type { Sql } from "@/lib/db";
import type { ParentAbsenceStatus } from "@/lib/daily-care";
import type { RatioStatus } from "@/lib/provincial-ratios";

export async function readCentreAbsences(sql: Sql, daycareId: string, localDay: string) {
  return sql<{
    id: string;
    child_name: string;
    status: ParentAbsenceStatus;
    children_now: number | null;
    ratio_status: RatioStatus | null;
  }>`
    select a.id, a.child_name, a.status, snapshot.children_now, snapshot.ratio_status
    from attendance a
    left join lateral (
      select r.children_now, r.ratio_status
      from absence_reports r
      where r.daycare_id = a.daycare_id and r.day = a.day and r.parent_user_id = a.parent_user_id
        and (r.id = 'ab_' || a.id or (a.booking_id is null and r.child_name = a.child_name))
      order by (r.id = 'ab_' || a.id) desc, r.created_at desc, r.id desc
      limit 1
    ) snapshot on true
    where a.daycare_id = ${daycareId} and a.day = ${localDay}
      and a.status in ('absent', 'sick', 'vacation') and a.updated_by = a.parent_user_id
    order by a.child_name, a.id
  `;
}
