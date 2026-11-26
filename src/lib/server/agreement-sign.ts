/**
 * In-app enrolment agreement signing (used when DocuSign is not set up).
 * Parent reviews and signs with a typed name, the centre countersigns, then the
 * booking moves to enrolled ("active"). Both sides can download the signed copy.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { parentAgreementEnabled } from "@/lib/features";
import {
  checkTypedSignature,
  signedAgreementHtml,
  type InAppSignature,
} from "@/lib/pipeline-features";

type Row = {
  id: string;
  contract_id: string;
  daycare_id: string;
  daycare_name: string;
  booking_id: string | null;
  parent_user_id: string;
  parent_name: string;
  director_name: string;
  child_name: string;
  status: string;
  terms: unknown;
  envelope_id: string | null;
};

type InAppDoc = { bodyHtml: string; signatures: InAppSignature[] };

function readDoc(terms: unknown): InAppDoc | null {
  let value = terms;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const raw = (value as { inAppSigning?: { bodyHtml?: unknown; signatures?: unknown } } | null)
    ?.inAppSigning;
  if (!raw || typeof raw.bodyHtml !== "string") return null;
  const signatures = Array.isArray(raw.signatures)
    ? raw.signatures.flatMap((item) => {
        const sig = (item || {}) as Partial<InAppSignature>;
        if ((sig.role !== "parent" && sig.role !== "director") || typeof sig.name !== "string")
          return [];
        return [{ role: sig.role, name: sig.name, at: String(sig.at || "") }];
      })
    : [];
  return { bodyHtml: raw.bodyHtml, signatures };
}

async function loadRow(sql: Sql, agreementId: string): Promise<Row | null> {
  const rows = await sql<Row>`
    select a.id, a.contract_id, a.daycare_id, d.name as daycare_name, a.booking_id, a.parent_user_id,
           a.parent_name, a.director_name, a.child_name, a.status, a.terms, c.envelope_id
      from parent_enrolment_agreements a
      join daycares d on d.id = a.daycare_id
      join daycare_contracts c on c.id = a.contract_id
     where a.id = ${agreementId}
     limit 1
  `.catch(() => [] as Row[]);
  return rows[0] ?? null;
}

async function viewerRole(sql: Sql, userId: string, row: Row): Promise<"parent" | "centre" | null> {
  if (row.parent_user_id === userId) return "parent";
  try {
    const { familyScopeFor } = await import("@/lib/server/coparent");
    if ((await familyScopeFor(userId)).dataUserId === row.parent_user_id) return "parent";
  } catch {
    /* not a family member */
  }
  try {
    const { assertCentreAction } = await import("@/lib/server/centre-access");
    await assertCentreAction(sql, userId, row.daycare_id, "contracts");
    return "centre";
  } catch {
    return null;
  }
}

export const openInAppAgreement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { agreementId?: string }) => ({
    agreementId: String(input?.agreementId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!parentAgreementEnabled()) throw new Error("agreement:signing_off");
    const sql = await getSql();
    const row = await loadRow(sql, data.agreementId);
    if (!row) throw new Error("agreement:not_found");
    const role = await viewerRole(sql, context.userId, row);
    if (!role) throw new Error("agreement:not_found");
    const doc = readDoc(row.terms);
    if (row.envelope_id || !doc) throw new Error("agreement:not_found");
    return {
      role,
      status: row.status,
      daycareName: row.daycare_name,
      childName: row.child_name,
      expectedName: role === "parent" ? row.parent_name : row.director_name,
      bodyHtml: doc.bodyHtml,
      signatures: doc.signatures,
    };
  });

export const signInAppAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { agreementId?: string; typedName?: string; agreed?: boolean }) => ({
    agreementId: String(input?.agreementId || "").trim(),
    typedName: String(input?.typedName || "").slice(0, 200),
    agreed: input?.agreed === true,
  }))
  .handler(async ({ context, data }) => {
    if (!parentAgreementEnabled()) throw new Error("agreement:signing_off");
    const sql = await getSql();
    const row = await loadRow(sql, data.agreementId);
    if (!row) throw new Error("agreement:not_found");
    const role = await viewerRole(sql, context.userId, row);
    const doc = readDoc(row.terms);
    if (!role || row.envelope_id || !doc) throw new Error("agreement:not_found");
    const expected = role === "parent" ? row.parent_name : "";
    const check = checkTypedSignature({
      typedName: data.typedName,
      expectedName: expected,
      agreed: data.agreed,
    });
    if (!check.ok) return { ok: false as const, error: check.error };
    const from = role === "parent" ? "sent" : "parent_signed";
    const to = role === "parent" ? "parent_signed" : "completed";
    if (row.status !== from) return { ok: false as const, error: "state" as const };
    const signature: InAppSignature = {
      role: role === "parent" ? "parent" : "director",
      name: check.name,
      at: new Date().toISOString(),
    };
    const nextTerms = (() => {
      let base: Record<string, unknown> = {};
      try {
        base = (typeof row.terms === "string" ? JSON.parse(row.terms) : row.terms) as Record<
          string,
          unknown
        >;
      } catch {
        base = {};
      }
      return {
        ...base,
        inAppSigning: { bodyHtml: doc.bodyHtml, signatures: [...doc.signatures, signature] },
      };
    })();
    const updated = await sql`
      update parent_enrolment_agreements
         set status = ${to}, terms = ${JSON.stringify(nextTerms)}::jsonb, updated_at = now()
       where id = ${row.id} and status = ${from}
      returning id
    `;
    if (!updated[0]) return { ok: false as const, error: "state" as const };
    await sql`
      update daycare_contracts
         set status = ${to},
             last_event = ${role === "parent" ? "in_app_parent_signed" : "in_app_completed"},
             viewed_at = coalesce(viewed_at, now()),
             signed_at = ${to === "completed" ? new Date().toISOString() : null},
             updated_at = now()
       where id = ${row.contract_id}
    `;
    if (to === "completed" && row.booking_id) {
      // Enrolment handoff: both sides signed, so the child is enrolled.
      const { claimRequestStatusTransition } =
        await import("@/lib/server/request-status-transition");
      const moved = await claimRequestStatusTransition(sql, row.booking_id, "active").catch(
        () => null,
      );
      if (moved) {
        const { syncBookingLeadStatus } = await import("@/lib/server/pipeline-sync");
        await syncBookingLeadStatus(sql, row.booking_id, "active", context.userId).catch(
          () => undefined,
        );
      }
    }
    return { ok: true as const, status: to };
  });

export const downloadInAppAgreement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { agreementId?: string }) => ({
    agreementId: String(input?.agreementId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!parentAgreementEnabled()) throw new Error("agreement:signing_off");
    const sql = await getSql();
    const row = await loadRow(sql, data.agreementId);
    if (!row) throw new Error("agreement:not_found");
    const role = await viewerRole(sql, context.userId, row);
    const doc = readDoc(row.terms);
    if (!role || row.envelope_id || !doc || row.status !== "completed")
      throw new Error("agreement:not_found");
    const title = `Enrolment agreement · ${row.daycare_name} · ${row.child_name}`;
    const slug = `${row.daycare_name}-${row.child_name}`
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    return {
      filename: `${slug || "agreement"}-signed.html`,
      html: signedAgreementHtml({ title, bodyHtml: doc.bodyHtml, signatures: doc.signatures }),
    };
  });
