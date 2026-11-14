import { createFileRoute } from "@tanstack/react-router";
import { getSql, type Sql } from "@/lib/db";
import { resolveAdminAccess } from "@/lib/server/roles";
import { loadSignedPdfBytes } from "@/lib/server/docusign";
import { profileRoleForUser } from "@/lib/server/gov-guard.server";
import { roleMayEnterZone } from "@/lib/gov/access";
import { privateHttpUnavailableResponse } from "@/lib/gov/http-isolation";
import { PARENT_AGREEMENT_PACK } from "@/lib/parent-agreement";

async function fail(status: number, message: string) {
  return Response.json({ ok: false, error: message }, { status });
}

type PdfContractRow = {
  id: string;
  daycare_id: string;
  envelope_id: string | null;
  signed_pdf_key: string | null;
  provider_user_id: string | null;
  document_name: string | null;
  status: string;
  pack_kind: string | null;
};

async function run(_request: Request, contractId: string) {
  const { enrolmentEsignEnabled } = await import("@/lib/features");
  if (!enrolmentEsignEnabled()) return fail(404, "Signing is not open yet.");
  const { requireUserId } = await import("@/lib/auth/verify.server");
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return fail(401, "Not authorized");
  }

  let role: string | null;
  try {
    role = await profileRoleForUser(userId);
  } catch {
    return privateHttpUnavailableResponse();
  }
  if (!roleMayEnterZone(role, "parent")) return fail(403, "Not authorized");
  const providerZoneAllowed = roleMayEnterZone(role, "provider");
  let sql: Sql;
  let rows: PdfContractRow[];
  try {
    sql = await getSql();
    // Generic and missing contract IDs look the same to a parent account.
    rows = await sql<PdfContractRow>`
      select id, daycare_id, envelope_id, signed_pdf_key, provider_user_id, document_name, status, pack_kind
      from daycare_contracts
      where id = ${contractId}
        and (${providerZoneAllowed} or pack_kind = ${PARENT_AGREEMENT_PACK})
      limit 1
    `;
  } catch {
    return privateHttpUnavailableResponse();
  }
  const row = rows[0];
  if (!row) return fail(404, "Contract not found");

  if (row.pack_kind === PARENT_AGREEMENT_PACK) {
    const { parentAgreementEnabled } = await import("@/lib/features");
    if (!parentAgreementEnabled()) return fail(404, "Signing is not open yet.");
    const { parentAgreementReadable } = await import("@/lib/server/parent-agreement");
    const allowed = await parentAgreementReadable(sql, userId, row.id);
    if (!allowed) return fail(401, "Not authorized");
  } else {
    // A historical provider association must not grant a parent access to a
    // provider pack, even if a future query stops enforcing the pack predicate.
    if (!roleMayEnterZone(role, "provider")) return fail(403, "Not authorized");
    const admin = await resolveAdminAccess(userId);
    const owned = await sql<{ ok: number }>`
      select 1 as ok from provider_daycares
      where daycare_id = ${row.daycare_id} and user_id = ${userId}
      limit 1
    `.catch(() => []);
    if (!admin.ok && !owned[0] && row.provider_user_id !== userId) {
      return fail(401, "Not authorized");
    }
  }

  const pdf = await loadSignedPdfBytes({
    contractId: row.id,
    daycareId: row.daycare_id,
    envelopeId: row.envelope_id,
    signedPdfKey: row.signed_pdf_key,
  });
  if (!pdf) {
    const finished = row.status === "signed" || row.status === "completed";
    return fail(404, finished ? "Signed PDF is not stored yet" : "No signed PDF yet");
  }

  const filename = `${(row.document_name || "kidease-signed").replace(/[^\w.-]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(pdf.body), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/api/contracts/$id/pdf")({
  server: {
    handlers: {
      GET: ({ request, params }) => run(request, params.id),
    },
  },
});
