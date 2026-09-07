import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { resolveAdminAccess } from "@/lib/server/roles";
import { loadSignedPdfBytes } from "@/lib/server/docusign";

async function fail(status: number, message: string) {
  return Response.json({ ok: false, error: message }, { status });
}

async function run(_request: Request, contractId: string) {
  const { requireUserId } = await import("@/lib/auth/verify.server");
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return fail(401, "Not authorized");
  }

  const sql = await getSql();
  const rows = await sql<{
    id: string;
    daycare_id: string;
    envelope_id: string | null;
    signed_pdf_key: string | null;
    provider_user_id: string | null;
    document_name: string | null;
    status: string;
  }>`
    select id, daycare_id, envelope_id, signed_pdf_key, provider_user_id, document_name, status
    from daycare_contracts
    where id = ${contractId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return fail(404, "Contract not found");

  const admin = await resolveAdminAccess(userId);
  const owned = await sql<{ ok: number }>`
    select 1 as ok from provider_daycares
    where daycare_id = ${row.daycare_id} and user_id = ${userId}
    limit 1
  `.catch(() => []);
  if (!admin.ok && !owned[0] && row.provider_user_id !== userId) {
    return fail(401, "Not authorized");
  }

  const pdf = await loadSignedPdfBytes({
    contractId: row.id,
    daycareId: row.daycare_id,
    envelopeId: row.envelope_id,
    signedPdfKey: row.signed_pdf_key,
  });
  if (!pdf) {
    return fail(404, row.status === "signed" ? "Signed PDF is not stored yet" : "No signed PDF yet");
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
