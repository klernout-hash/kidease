import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql } from "@/lib/db";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import type { GovActor } from "@/lib/server/gov-actor.server";
import {
  dsrPropagationEnabled,
  dsrPropagationMode,
  dsrRoleDone,
  governmentDsrVisible,
  openDsr,
  type DsrKind,
  type DsrRole,
  type DsrStatus,
} from "@/lib/wiring/dsr-propagation";
import { deliverNotice, newId } from "@/lib/server/wiring/runtime";

async function retentionHeld(userId: string): Promise<boolean> {
  const sql = await getSql();
  const table = await sql<{ name: string | null }>`select to_regclass('public.retention_holds') as name`.catch(() => []);
  if (!table[0]?.name) return false;
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from retention_holds
    where user_id = ${userId} and released_at is null
  `.catch(() => [{ n: 0 }]);
  return Number(rows[0]?.n) > 0;
}

export const openDataRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind?: string; province?: string }) => ({
    kind: String(input?.kind || "").slice(0, 20),
    province: String(input?.province || "").slice(0, 8).toUpperCase(),
  }))
  .handler(async ({ context, data }) => {
    if (!dsrPropagationEnabled()) return { ok: false as const, error: "off" };
    const held = await retentionHeld(context.userId);
    const sql = await getSql();
    const centres = await listAccessibleDaycareIds(sql, context.userId).catch(() => []);
    const roles: DsrRole[] = ["parent", "admin"];
    if (centres.length) roles.push("provider");
    if (data.province) roles.push("government");
    const opened = openDsr({ kind: data.kind, held, roles });
    if (!opened.ok) return { ok: false as const, error: opened.error };
    const id = newId("dsr");
    await sql`
      insert into dsr_requests (id, user_id, kind, status, province, held)
      values (${id}, ${context.userId}, ${opened.kind}, ${opened.status}, ${data.province || null}, ${held ? 1 : 0})
    `;
    const mode = dsrPropagationMode();
    for (const role of opened.targets) {
      if (role === "parent") continue;
      await sql`
        insert into dsr_tasks (id, request_id, role, status)
        values (${newId("dst")}, ${id}, ${role}, ${"open"})
      `;
    }
    if (opened.status !== "blocked") {
      const admins = await sql<{ user_id: string }>`select user_id from profiles where role = 'admin' limit 10`;
      for (const admin of admins) {
        await deliverNotice({
          feature: "dsr",
          flag: "FEATURE_DSR_PROPAGATION",
          mode,
          userId: admin.user_id,
          role: "admin",
          title: opened.kind === "delete" ? "Deletion request" : "Export request",
          body: "A person asked KidEase to export or delete their records. Their sign-in stays until they use Delete account.",
          href: "/admin/data-requests",
          senderUserId: context.userId,
          province: data.province,
        });
      }
    }
    return { ok: true as const, id, status: opened.status, held };
  });

export const completeDsrTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { requestId?: string }) => ({ requestId: String(input?.requestId || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!dsrPropagationEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const roleRows = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId} limit 1`;
    const role = roleRows[0]?.role === "admin" ? "admin" : "provider";
    const request = await sql<{ id: string; kind: string; status: string; held: number; province: string | null; user_id: string }>`
      select id, kind, status, held, province, user_id from dsr_requests where id = ${data.requestId} limit 1
    `;
    const row = request[0];
    if (!row) return { ok: false as const, error: "missing" };
    if (role === "provider") {
      const ids = await listAccessibleDaycareIds(sql, context.userId);
      if (!ids.length) return { ok: false as const, error: "centre" };
    }
    if (Number(row.held) === 1 && row.kind === "delete") return { ok: false as const, error: "hold" };
    await sql`
      update dsr_tasks set status = 'done', done_by = ${context.userId}, done_at = now()
      where request_id = ${row.id} and role = ${role} and status = 'open'
    `;
    const left = await sql<{ n: number }>`
      select count(*)::int as n from dsr_tasks where request_id = ${row.id} and status = 'open'
    `;
    const status = dsrRoleDone({
      status: row.status as DsrStatus,
      remaining: Number(left[0]?.n ?? 0),
      held: Number(row.held) === 1,
      kind: row.kind as DsrKind,
    });
    await sql`update dsr_requests set status = ${status}, updated_at = now() where id = ${row.id}`;
    return { ok: true as const, status };
  });

export const govDsrQueue = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    if (!dsrPropagationEnabled()) return { enabled: false as const, rows: [] };
    const gov = context.gov as GovActor;
    const sql = await getSql();
    const rows = await sql<{ id: string; kind: string; status: string; province: string | null }>`
      select id, kind, status, province from dsr_requests
      where province is not null
      order by created_at desc
      limit 40
    `.catch(() => []);
    return {
      enabled: true as const,
      rows: rows.filter((row) => governmentDsrVisible(gov.province, row.province || "")),
    };
  });

export const myDataRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!dsrPropagationEnabled()) return { enabled: false as const, rows: [] };
    const sql = await getSql();
    const rows = await sql<{ id: string; kind: string; status: string; held: number }>`
      select id, kind, status, held from dsr_requests
      where user_id = ${context.userId}
      order by created_at desc limit 20
    `.catch(() => [] as { id: string; kind: string; status: string; held: number }[]);
    return { enabled: true as const, rows };
  });
