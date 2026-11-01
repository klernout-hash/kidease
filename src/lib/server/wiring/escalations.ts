import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql } from "@/lib/db";
import type { GovActor } from "@/lib/server/gov-actor.server";
import { escalationDue, escalationsEnabled, escalationsMode, parseSlaHours } from "@/lib/wiring/escalations";
import { deliverNotice, newId } from "@/lib/server/wiring/runtime";

export const openEscalation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind?: string; refId?: string; province?: string; slaHours?: number }) => ({
    kind: String(input?.kind || "").slice(0, 40),
    refId: String(input?.refId || "").slice(0, 80),
    province: String(input?.province || "").slice(0, 8).toUpperCase(),
    slaHours: parseSlaHours(input?.slaHours),
  }))
  .handler(async ({ context, data }) => {
    if (!escalationsEnabled()) return { ok: false as const, error: "off" };
    if (!data.kind || !data.slaHours) return { ok: false as const, error: "sla" };
    const sql = await getSql();
    const roleRows = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId} limit 1`;
    const role = roleRows[0]?.role === "admin" ? "admin" : "parent";
    const id = newId("es");
    await sql`
      insert into escalation_items (id, kind, ref_id, province, opened_by, sla_hours)
      values (${id}, ${data.kind}, ${data.refId}, ${data.province}, ${context.userId}, ${data.slaHours})
    `;
    await sql`
      insert into escalation_parties (item_id, user_id, role)
      values (${id}, ${context.userId}, ${role})
    `;
    return { ok: true as const, id };
  });

export const sweepEscalations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!escalationsEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const role = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId} limit 1`;
    if (role[0]?.role !== "admin") return { ok: false as const, error: "admin" };
    const rows = await sql<{ id: string; opened_at: string; sla_hours: number; resolved_at: string | null; province: string; kind: string }>`
      select id, opened_at, sla_hours, resolved_at, province, kind
      from escalation_items
      where escalated_at is null
      limit 100
    `.catch(() => []);
    const now = new Date().toISOString();
    const mode = escalationsMode();
    let due = 0;
    for (const row of rows) {
      if (!escalationDue({ openedAt: String(row.opened_at), slaHours: row.sla_hours, now, resolved: Boolean(row.resolved_at) })) {
        continue;
      }
      due += 1;
      if (mode === "live") {
        await sql`update escalation_items set escalated_at = now(), status = 'admin' where id = ${row.id}`;
      }
      const admins = await sql<{ user_id: string }>`select user_id from profiles where role = 'admin' limit 20`;
      for (const admin of admins) {
        await deliverNotice({
          feature: "escalations",
          flag: "FEATURE_ESCALATIONS",
          mode,
          userId: admin.user_id,
          role: "admin",
          title: "Item needs an admin",
          body: `${row.kind} passed its review time.`,
          href: "/admin/escalations",
          province: row.province,
        });
      }
    }
    return { ok: true as const, due, mode };
  });

export const myEscalations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!escalationsEnabled()) return { enabled: false as const, rows: [] };
    const sql = await getSql();
    const role = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId} limit 1`;
    const admin = role[0]?.role === "admin";
    const rows = admin
      ? await sql<{ id: string; kind: string; status: string; sla_hours: number; opened_at: string; resolved_at: string | null }>`
          select id, kind, status, sla_hours, opened_at, resolved_at
          from escalation_items
          order by opened_at desc
          limit 40
        `.catch(() => [])
      : await sql<{ id: string; kind: string; status: string; sla_hours: number; opened_at: string; resolved_at: string | null }>`
          select i.id, i.kind, i.status, i.sla_hours, i.opened_at, i.resolved_at
          from escalation_items i
          join escalation_parties p on p.item_id = i.id
          where p.user_id = ${context.userId}
          order by i.opened_at desc
          limit 40
        `.catch(() => []);
    return { enabled: true as const, rows };
  });

export const govEscalations = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    if (!escalationsEnabled()) return { enabled: false as const, rows: [] };
    const gov = context.gov as GovActor;
    const sql = await getSql();
    const rows = await sql<{ id: string; kind: string; status: string; province: string }>`
      select i.id, i.kind, i.status, i.province
      from escalation_items i
      join escalation_parties p on p.item_id = i.id
      where p.user_id = ${gov.userId} and upper(i.province) = ${gov.province.toUpperCase()}
      limit 40
    `.catch(() => [] as { id: string; kind: string; status: string; province: string }[]);
    return { enabled: true as const, rows };
  });
