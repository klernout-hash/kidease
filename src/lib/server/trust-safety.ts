import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/server/roles";
import { identityUploadDecision, reportSla, trustSafetyEnabled, type IdentityKind } from "@/lib/trust-safety";
import { nid } from "@/lib/utils";

export type ReportQueueRow = {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  sla: ReturnType<typeof reportSla>;
};

export type IdentityQueueRow = {
  id: string;
  daycareId: string;
  kind: string;
  status: string;
  createdAt: string;
};

export const loadTrustQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
  await requireAdmin(context.userId);
  if (!trustSafetyEnabled()) return { enabled: false as const, reports: [] as ReportQueueRow[], identity: [] as IdentityQueueRow[] };
  const sql = await getSql();
  const now = new Date();
  const reports = await sql<{ id: string; reason: string; status: string; created_at: string }>`
    select id, reason, status, created_at
    from safety_reports
    where status = 'open'
    order by created_at asc
    limit 50
  `;
  const identity = await sql<{ id: string; daycare_id: string; doc_kind: string; status: string; created_at: string }>`
    select id, daycare_id, doc_kind, status, created_at
    from owner_identity_reviews
    where status = 'submitted'
    order by created_at asc
    limit 50
  `;
  return {
    enabled: true as const,
    reports: reports.map((row) => ({
      id: row.id,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      sla: reportSla({ status: row.status, createdAt: row.created_at, now }),
    })),
    identity: identity.map((row) => ({
      id: row.id,
      daycareId: row.daycare_id,
      kind: row.doc_kind,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
});

export const submitIdentityReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; kind: string; filename: string; mime: string; bytes: number }) => input)
  .handler(async ({ context, data }) => {
    const decision = identityUploadDecision({
      enabled: trustSafetyEnabled(),
      kind: data.kind,
      filename: data.filename,
      mime: data.mime,
      bytes: data.bytes,
    });
    if (!decision.ok) return { ok: false as const, reason: decision.reason };
    const daycareId = String(data.daycareId || "").trim();
    if (!daycareId) return { ok: false as const, reason: "listing" as const };
    const sql = await getSql();
    const owned = await sql<{ id: string }>`
      select daycare_id as id from centre_members
      where user_id = ${context.userId} and daycare_id = ${daycareId} and status = 'active'
      limit 1
    `;
    if (!owned[0]) return { ok: false as const, reason: "listing" as const };
    const id = nid("idv");
    const kind: IdentityKind = decision.kind;
    await sql`
      insert into owner_identity_reviews (id, user_id, daycare_id, doc_kind, filename, mime, byte_size)
      values (${id}, ${context.userId}, ${daycareId}, ${kind}, ${data.filename.slice(0, 180)}, ${data.mime}, ${Math.round(data.bytes)})
    `;
    return { ok: true as const, id };
  });

