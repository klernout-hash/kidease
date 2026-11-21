import { createServerFn } from "@tanstack/react-start";
import { hourlyAllowance, PRIVACY_OFFICER_EMAIL, PRIVACY_REQUEST_HOURLY_MAX } from "@/lib/account-export";
import { getSql } from "@/lib/db";
import { evaluateFeatureFlag } from "@/lib/flags";
import { privacyCase } from "@/lib/phase1-ops";
import { authMiddleware } from "@/lib/auth/middleware";

export const securityPageFlag = createServerFn({ method: "GET" }).handler(async () => ({
  security: evaluateFeatureFlag("FEATURE_SECURITY_PAGE"),
  privacy: evaluateFeatureFlag("FEATURE_PRIVACY_REQUESTS"),
  audit: evaluateFeatureFlag("FEATURE_AUDIT_LOG"),
}));

export const createPrivacyRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { kind?: string; note?: string }) => ({
    kind: data?.kind,
    note: String(data?.note || "").slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    if (!evaluateFeatureFlag("FEATURE_PRIVACY_REQUESTS")) return { ok: false as const, error: "off" };
    const kind = data.kind === "access" || data.kind === "correction" || data.kind === "deletion" ? data.kind : null;
    if (!kind) return { ok: false as const, error: "kind" };
    const sql = await getSql();
    let recent = 0;
    try {
      const rows = await sql<{ n: number }>`
        select count(*)::int as n
        from privacy_requests
        where user_id = ${context.userId}
          and created_at > now() - interval '1 hour'
      `;
      const n = Number(rows[0]?.n ?? 0);
      recent = Number.isFinite(n) ? n : PRIVACY_REQUEST_HOURLY_MAX;
    } catch {
      return { ok: false as const, error: "unavailable" as const };
    }
    if (!hourlyAllowance(recent, PRIVACY_REQUEST_HOURLY_MAX).ok) {
      return { ok: false as const, error: "rate" as const };
    }
    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const made = privacyCase({ type: kind, requesterId: context.userId, nonce });
    const note = String(data.note || "").trim().slice(0, 500);
    try {
      await sql`
        insert into privacy_requests (id, user_id, kind, note)
        values (${made.caseId}, ${context.userId}, ${kind}, ${note})
      `;
    } catch {
      return { ok: false as const, error: "unavailable" as const };
    }
    return {
      ok: true as const,
      caseId: made.caseId,
      contact: made.contact,
      sendsEmail: made.sendsEmail,
    };
  });

/** Privacy officer queue. Admin only. Does not send email. */
export const listPrivacyRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!evaluateFeatureFlag("FEATURE_PRIVACY_REQUESTS")) return { ok: false as const, error: "off" as const };
    try {
      const { requireAdmin } = await import("@/lib/server/roles");
      await requireAdmin(context.userId);
    } catch {
      return { ok: false as const, error: "forbidden" as const };
    }
    const sql = await getSql();
    try {
      const rows = await sql<{
        id: string;
        user_id: string | null;
        kind: string;
        note: string;
        created_at: string | Date;
        email: string | null;
        name: string | null;
      }>`
        select p.id, p.user_id, p.kind, p.note, p.created_at, u.email, u.name
        from privacy_requests p
        left join "user" u on u.id = p.user_id
        order by p.created_at desc
        limit 50
      `;
      return {
        ok: true as const,
        contact: PRIVACY_OFFICER_EMAIL,
        sendsEmail: false as const,
        requests: rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          kind: row.kind,
          note: row.note,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          email: row.email,
          name: row.name,
          routedTo: PRIVACY_OFFICER_EMAIL,
        })),
      };
    } catch {
      return { ok: false as const, error: "unavailable" as const };
    }
  });
