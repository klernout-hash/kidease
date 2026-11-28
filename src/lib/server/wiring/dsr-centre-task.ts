import type { Sql } from "../../db";

/**
 * Applies a verified Admin selection to exactly one existing provider task.
 * Multiple unassigned tasks are ambiguous; leave them for manual review.
 * Deletion never goes through this centre workflow.
 */
export async function assignPendingCentreExport(
  sql: Sql,
  input: { actorId: string; requestId: string; centreId: string },
) {
  const rows = await sql<{ task_id: string }>`
    with eligible as (
      select t.id, count(*) over () as task_count
      from dsr_tasks t
      join dsr_requests r on r.id = t.request_id
      where r.id = ${input.requestId} and r.kind = 'export'
        and r.status in ('received', 'with_roles')
        and t.role = 'provider' and t.status = 'open'
        and t.daycare_id is null and t.assigned_by is null
    )
    update dsr_tasks t
    set daycare_id = d.id, assigned_by = ${input.actorId}, assigned_at = now()
    from eligible e, daycares d
    where e.task_count = 1 and e.id = t.id and d.id = ${input.centreId}
      and t.role = 'provider' and t.status = 'open'
      and t.daycare_id is null and t.assigned_by is null
    returning t.id as task_id
  `;
  return rows.length === 1;
}

export type AssignedCentreExport = {
  taskId: string;
  centreName: string;
};

export async function listOwnedCentreExports(sql: Sql, actorId: string): Promise<AssignedCentreExport[]> {
  return sql<AssignedCentreExport>`
    select t.id as "taskId", d.name as "centreName"
    from dsr_tasks t
    join dsr_requests r on r.id = t.request_id
    join daycares d on d.id = t.daycare_id
    where t.role = 'provider' and t.status = 'open' and t.assigned_by is not null
      and t.assigned_at is not null
      and r.kind = 'export' and r.status in ('received', 'with_roles')
      and (exists (select 1 from provider_daycares p where p.daycare_id = d.id and p.user_id = ${actorId})
        or exists (select 1 from centre_members m where m.daycare_id = d.id and m.user_id = ${actorId}
          and m.role = 'owner' and m.status = 'active'))
    order by t.assigned_at desc, t.id
    limit 50
  `;
}

export async function completeOwnedCentreExport(sql: Sql, actorId: string, taskId: string) {
  const rows = await sql<{ id: string }>`
    update dsr_tasks t set status = 'done', done_by = ${actorId}, done_at = now()
    from dsr_requests r, daycares d
    where t.id = ${taskId} and t.request_id = r.id and t.daycare_id = d.id
      and t.role = 'provider' and t.status = 'open' and t.assigned_by is not null
      and t.assigned_at is not null
      and r.kind = 'export' and r.status in ('received', 'with_roles')
      and (exists (select 1 from provider_daycares p where p.daycare_id = d.id and p.user_id = ${actorId})
        or exists (select 1 from centre_members m where m.daycare_id = d.id and m.user_id = ${actorId}
          and m.role = 'owner' and m.status = 'active'))
    returning t.id
  `;
  // Only the centre's task changed. Admin still owns overall request status.
  return rows.length === 1;
}
