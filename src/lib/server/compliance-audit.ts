import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import { auditMode, purgePlan, type AuditRow } from "@/lib/compliance/audit";
import { logPractice, readScope, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

export async function writeAudit(input: { actorId: string | null; province: string | null; action: string; target: string }) {
  const sql = await sqlClient();
  await sql`
    insert into compliance_audit_log (id, actor_id, province, action, target)
    values (${nid("aud")}, ${input.actorId}, ${input.province}, ${input.action.slice(0, 80)}, ${input.target.slice(0, 120)})
  `.catch(() => undefined);
}

async function rowsFor(province: string | null): Promise<AuditRow[]> {
  const sql = await sqlClient();
  const rows = province
    ? await sql<{ id: string; province: string; created_at: string }>`
        select id, province, created_at from compliance_audit_log where province = ${province} order by created_at asc limit 500
      `.catch(() => [])
    : await sql<{ id: string; province: string; created_at: string }>`
        select id, province, created_at from compliance_audit_log order by created_at asc limit 500
      `.catch(() => []);
  return rows.map((row) => ({ id: row.id, province: row.province || "ON", at: new Date(row.created_at).toISOString() }));
}

export const loadGovAudit = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = auditMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    await writeAudit({ actorId: gov.userId, province, action: "read_audit", target: "gov" });
    if (mode === "off") return { enabled: false as const, mode, province, wouldDelete: 0 };
    const plan = purgePlan(await rowsFor(province), new Date(), mode);
    return { enabled: true as const, mode, province, wouldDelete: plan.length };
  });

export const loadAdminAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = auditMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, wouldDelete: 0 };
    const plan = purgePlan(await rowsFor(data.province), new Date(), mode);
    return { enabled: true as const, mode, province: data.province, wouldDelete: plan.length };
  });

export async function runAuditJob(now = new Date()) {
  const mode = auditMode(process.env);
  if (mode === "off") return { ok: true, mode, deleted: 0, listed: 0 };
  const plan = purgePlan(await rowsFor(null), now, mode);
  logPractice("FEATURE_AUDIT_RETENTION", { action: "purge", mode, count: plan.length });
  if (mode !== "live") return { ok: true, mode, deleted: 0, listed: plan.length };
  const sql = await sqlClient();
  let deleted = 0;
  for (const row of plan) {
    if (row.action !== "delete") continue;
    await sql`delete from compliance_audit_log where id = ${row.id}`;
    deleted += 1;
  }
  await writeAudit({ actorId: null, province: null, action: "purge", target: String(deleted) });
  return { ok: true, mode, deleted, listed: plan.length };
}
