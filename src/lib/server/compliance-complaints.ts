import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import { complaintsMode, isComplaintKind, reminderPlan, routeComplaint, trackingCode } from "@/lib/compliance/complaints";
import { suppressRows } from "@/lib/gov/k-anonymity";
import { centreRow, logPractice, readScope, sendComplianceEmail, sqlClient } from "@/lib/server/compliance-common";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { requireAdmin } from "@/lib/server/roles";

export const loadParentComplaints = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const mode = complaintsMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, rows: [] };
    const sql = await sqlClient();
    const rows = await sql<{ id: string; tracking_code: string; province: string; status: string }>`
      select id, tracking_code, province, status from licensing_complaints
      where parent_user_id = ${context.userId}
      order by created_at desc limit 20
    `.catch(() => []);
    return { enabled: true as const, mode, rows };
  });

export const saveComplaint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; province?: string; kind?: string; detail?: string }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const mode = complaintsMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const kind = String(data.kind || "");
    const detail = String(data.detail || "").trim().slice(0, 2000);
    if (!isComplaintKind(kind) || detail.length < 8) return { ok: false as const, reason: "form" };
    const sql = await sqlClient();
    const daycareId = String(data.daycareId || "").trim();
    const centre = daycareId ? await centreRow(sql, daycareId) : null;
    const province = routeComplaint({ listingProvince: centre?.province || null, chosenProvince: data.province || null });
    if (!province) return { ok: false as const, reason: "province" };
    const code = trackingCode(createHash("sha256").update(randomBytes(8)).digest("hex"));
    const id = nid("cmp");
    await sql`
      insert into licensing_complaints (id, parent_user_id, daycare_id, province, kind, detail, tracking_code)
      values (${id}, ${context.userId}, ${daycareId || null}, ${province}, ${kind}, ${detail}, ${code})
    `;
    logPractice("FEATURE_GOV_COMPLAINTS", { action: "intake", id, province, kind, mode });
    if (mode === "live") {
      const parent = await sql<{ email: string | null }>`select email from "user" where id = ${context.userId} limit 1`.catch(() => []);
      if (parent[0]?.email) {
        await sendComplianceEmail({
          to: parent[0].email,
          subject: "KidEase: your complaint number",
          text: `Your tracking number is ${code}. Keep it to ask about the complaint.`,
          aboutTestListing: centre
            ? isAdminOnlyListing({
                name: centre.name,
                slug: centre.slug,
                visibility: centre.visibility,
                isTest: centre.is_test,
              })
            : false,
        });
      }
    }
    return { ok: true as const, id, trackingCode: code, province };
  });

export const loadGovComplaints = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = complaintsMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, rows: [], counts: [] };
    const sql = await sqlClient();
    const rows = await sql<{ kind: string; status: string }>`
      select kind, status from licensing_complaints
      where province = ${province}
    `.catch(() => []);
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.kind}\t${row.status}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      enabled: true as const,
      mode,
      province,
      rows: [],
      counts: suppressRows(
        [...counts.entries()].map(([key, n]) => {
          const [kind, status] = key.split("\t");
          return { kind, status, n };
        }),
      ).map((row) => ({ kind: row.kind, status: row.status, n: row.suppressed ? null : row.n })),
    };
  });

export const loadAdminComplaints = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = complaintsMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, rows: [] };
    const sql = await sqlClient();
    const rows = await sql<{ id: string; kind: string; status: string; tracking_code: string }>`
      select id, kind, status, tracking_code from licensing_complaints where province = ${data.province} order by created_at desc limit 40
    `.catch(() => []);
    return { enabled: true as const, mode, province: data.province, rows: rows.map((row) => ({ id: row.id, kind: row.kind, status: row.status, trackingCode: row.tracking_code })) };
  });

export async function runComplaintJob(now = new Date()) {
  const mode = complaintsMode(process.env);
  if (mode === "off") return { ok: true, mode, reminded: 0 };
  const sql = await sqlClient();
  const rows = await sql<{ id: string; province: string; created_at: string; status: string; reminded_at: string | null }>`
    select id, province, created_at, status, reminded_at from licensing_complaints
    where status = 'open' limit 100
  `.catch(() => []);
  let reminded = 0;
  for (const row of rows) {
    const plan = reminderPlan({
      mode,
      opened: new Date(row.created_at),
      now,
      closed: row.status !== "open",
      alreadyReminded: Boolean(row.reminded_at),
    });
    if (!plan.remind) continue;
    logPractice("FEATURE_GOV_COMPLAINTS", { action: "sla", id: row.id, province: row.province, status: plan.status, delivery: plan.delivery, mode });
    if (plan.delivery === "send") {
      await sql`update licensing_complaints set reminded_at = now() where id = ${row.id}`;
    }
    reminded += 1;
  }
  return { ok: true, mode, reminded };
}
