import { createServerFn } from "@tanstack/react-start";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertGovWritable, type GovActor } from "@/lib/server/gov-actor.server";
import { complaintUpdate, complaintUpdatesEnabled, complaintUpdatesMode, pickComplaintSource } from "@/lib/wiring/complaint-updates";
import { deliverNotice, newId } from "@/lib/server/wiring/runtime";

export const postComplaintUpdate = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { reportId?: string; note?: string }) => ({
    reportId: String(input?.reportId || "").slice(0, 80),
    note: String(input?.note || "").slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    if (!complaintUpdatesEnabled()) return { ok: false as const, error: "off" };
    const gov = context.gov as GovActor;
    try {
      assertGovWritable(gov);
    } catch {
      return { ok: false as const, error: "read_only" };
    }
    const sql = await getSql();
    const govTable = await sql<{ name: string | null }>`select to_regclass('public.gov_complaints') as name`;
    const source = pickComplaintSource(Boolean(govTable[0]?.name));
    const rows =
      source === "gov_complaints"
        ? await sql<{ id: string; parent_user_id: string | null; province: string | null }>`
            select id, parent_user_id, province from gov_complaints where id = ${data.reportId} limit 1
          `.catch(() => [])
        : await sql<{ id: string; parent_user_id: string | null; province: string | null }>`
            select r.id, r.reporter_user_id as parent_user_id, d.province
            from safety_reports r
            left join daycares d on d.id = r.daycare_id
            where r.id = ${data.reportId}
            limit 1
          `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "missing" };
    const decision = complaintUpdate({
      note: data.note,
      actorProvince: gov.province,
      recordProvince: row.province || "",
      parentUserId: row.parent_user_id,
    });
    if (!decision.ok) return { ok: false as const, error: decision.error };
    await sql`
      insert into complaint_updates (id, source, report_id, province, parent_user_id, note, actor_id)
      values (
        ${newId("cu")}, ${source}, ${data.reportId}, ${gov.province}, ${decision.parentUserId},
        ${decision.note}, ${gov.userId}
      )
    `;
    await deliverNotice({
      feature: "complaint_updates",
      flag: "FEATURE_COMPLAINT_UPDATES",
      mode: complaintUpdatesMode(),
      userId: decision.parentUserId,
      role: "parent",
      title: "Update on your complaint",
      body: decision.note,
      href: "/parent/complaint-updates",
      province: gov.province,
      wantSms: true,
    });
    return { ok: true as const, source };
  });

export const myComplaintUpdates = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!complaintUpdatesEnabled()) return { enabled: false as const, rows: [] };
    const sql = await getSql();
    const rows = await sql<{ id: string; source: string; note: string; created_at: string }>`
      select id, source, note, created_at from complaint_updates
      where parent_user_id = ${context.userId}
      order by created_at desc limit 20
    `.catch(() => [] as { id: string; source: string; note: string; created_at: string }[]);
    return { enabled: true as const, rows };
  });
