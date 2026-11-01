import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql } from "@/lib/db";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { assertGovWritable, type GovActor } from "@/lib/server/gov-actor.server";
import { nextSubsidyStatus, subsidyStatusEnabled, subsidyStatusMode, type SubsidyStatus } from "@/lib/wiring/subsidy-status";
import { deliverNotice, newId } from "@/lib/server/wiring/runtime";

export const submitSubsidy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!subsidyStatusEnabled()) return { ok: false as const, error: "off" };
    const decision = nextSubsidyStatus({ from: null, to: "submitted", actor: "parent" });
    if (!decision.ok) return decision;
    const sql = await getSql();
    const centre = await sql<{ province: string }>`select province from daycares where id = ${data.daycareId} limit 1`;
    if (!centre[0]) return { ok: false as const, error: "centre" };
    const id = newId("sub");
    await sql`
      insert into subsidy_cases (id, parent_user_id, daycare_id, province, status)
      values (${id}, ${context.userId}, ${data.daycareId}, ${centre[0].province}, ${"submitted"})
    `;
    return { ok: true as const, id, status: "submitted" as const };
  });

export const updateSubsidy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; status?: string }) => ({
    id: String(input?.id || "").slice(0, 80),
    status: String(input?.status || "").slice(0, 20),
  }))
  .handler(async ({ context, data }) => {
    if (!subsidyStatusEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const rows = await sql<{ id: string; parent_user_id: string; daycare_id: string; province: string; status: string }>`
      select id, parent_user_id, daycare_id, province, status from subsidy_cases where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "missing" };
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.includes(row.daycare_id)) return { ok: false as const, error: "centre" };
    const decision = nextSubsidyStatus({
      from: row.status as SubsidyStatus,
      to: data.status,
      actor: "provider",
      recordProvince: row.province,
    });
    if (!decision.ok) return { ok: false as const, error: decision.error };
    await sql`update subsidy_cases set status = ${decision.status}, updated_at = now() where id = ${row.id}`;
    await deliverNotice({
      feature: "subsidy_status",
      flag: "FEATURE_SUBSIDY_STATUS",
      mode: subsidyStatusMode(),
      userId: row.parent_user_id,
      role: "parent",
      title: "Subsidy status updated",
      body: `Your subsidy status is ${decision.status}. KidEase does not decide the subsidy.`,
      href: "/parent/subsidy",
      province: row.province,
      wantSms: true,
    });
    return { ok: true as const, status: decision.status };
  });

export const govUpdateSubsidy = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string; status?: string }) => ({
    id: String(input?.id || "").slice(0, 80),
    status: String(input?.status || "").slice(0, 20),
  }))
  .handler(async ({ context, data }) => {
    if (!subsidyStatusEnabled()) return { ok: false as const, error: "off" };
    const gov = context.gov as GovActor;
    try {
      assertGovWritable(gov);
    } catch {
      return { ok: false as const, error: "read_only" };
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; parent_user_id: string; province: string; status: string }>`
      select id, parent_user_id, province, status from subsidy_cases where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "missing" };
    const decision = nextSubsidyStatus({
      from: row.status as SubsidyStatus,
      to: data.status,
      actor: "government",
      actorProvince: gov.province,
      recordProvince: row.province,
    });
    if (!decision.ok) return { ok: false as const, error: decision.error };
    await sql`update subsidy_cases set status = ${decision.status}, updated_at = now(), updated_by = ${gov.userId} where id = ${row.id}`;
    await deliverNotice({
      feature: "subsidy_status",
      flag: "FEATURE_SUBSIDY_STATUS",
      mode: subsidyStatusMode(),
      userId: row.parent_user_id,
      role: "parent",
      title: "Subsidy status updated",
      body: `Your province updated the subsidy status to ${decision.status}.`,
      href: "/parent/subsidy",
      province: row.province,
      wantSms: true,
    });
    return { ok: true as const, status: decision.status };
  });

export const mySubsidy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!subsidyStatusEnabled()) return { enabled: false as const, rows: [] };
    const sql = await getSql();
    const rows = await sql<{ id: string; daycare_id: string; province: string; status: string }>`
      select id, daycare_id, province, status from subsidy_cases
      where parent_user_id = ${context.userId}
      order by created_at desc limit 20
    `.catch(() => [] as { id: string; daycare_id: string; province: string; status: string }[]);
    return { enabled: true as const, rows };
  });
