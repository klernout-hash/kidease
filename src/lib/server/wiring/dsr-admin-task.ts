import type { Sql } from "../../db";
import { dsrRoleDone, type DsrKind, type DsrStatus } from "../../wiring/dsr-propagation.ts";

/**
 * Provider tasks have no centre assignment. Preserve them for review instead of
 * guessing from an account's current memberships, province or a request number.
 */
export async function completeAdminDsrTask(sql: Sql, actorId: string, requestId: string) {
  const roles = await sql<{ role: string }>`
    select role from profiles where user_id = ${actorId} limit 1
  `;
  if (roles[0]?.role !== "admin") return { ok: false as const, error: "forbidden" };

  const requests = await sql<{ id: string; kind: DsrKind; status: DsrStatus; held: number }>`
    select id, kind, status, held from dsr_requests where id = ${requestId} limit 1
  `;
  const request = requests[0];
  if (!request) return { ok: false as const, error: "missing" };
  if (Number(request.held) === 1 && request.kind === "delete") return { ok: false as const, error: "hold" };

  await sql`
    update dsr_tasks set status = 'done', done_by = ${actorId}, done_at = now()
    where request_id = ${request.id} and role = 'admin' and status = 'open'
  `;
  const left = await sql<{ n: number }>`
    select count(*)::int as n from dsr_tasks where request_id = ${request.id} and status = 'open'
  `;
  const status = dsrRoleDone({
    status: request.status,
    remaining: Number(left[0]?.n ?? 0),
    held: Number(request.held) === 1,
    kind: request.kind,
  });
  await sql`update dsr_requests set status = ${status}, updated_at = now() where id = ${request.id}`;
  return { ok: true as const, status };
}
