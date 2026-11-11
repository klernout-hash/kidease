import { createServerFn } from "@tanstack/react-start";
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
    const made = privacyCase({ type: kind, requesterId: context.userId });
    const note = String(data.note || "").trim().slice(0, 500);
    const sql = await getSql();
    await sql`
      insert into privacy_requests (id, user_id, kind, note)
      values (${made.caseId}, ${context.userId}, ${kind}, ${note})
      on conflict (id) do nothing
    `;
    return { ok: true as const, caseId: made.caseId };
  });
