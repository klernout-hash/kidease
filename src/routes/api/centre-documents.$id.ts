import { createFileRoute } from "@tanstack/react-router";
import { authorizeCentreDocument, uploadCentreDocument } from "@/lib/server/centre-documents";
import { loadPrivateDoc, privateDocResponse } from "@/lib/server/private-docs";

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  const status = /not authorized|only update|only open/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/centre-documents/$id")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        if (params.id !== "upload") return Response.json({ ok: false, error: "Not found" }, { status: 404 });
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const body = (await request.json()) as {
            daycareId?: string;
            kind?: "insurance" | "policy" | "handbook";
            policyKey?: string | null;
            dataUrl?: string;
            mime?: string;
            filename?: string;
            expiresOn?: string | null;
          };
          if (body.kind !== "insurance" && body.kind !== "policy" && body.kind !== "handbook") {
            return Response.json({ ok: false, error: "That document type is not saved here." }, { status: 400 });
          }
          const stored = await uploadCentreDocument(userId, {
            daycareId: String(body.daycareId || ""),
            kind: body.kind,
            policyKey: body.policyKey,
            dataUrl: String(body.dataUrl || ""),
            mime: String(body.mime || ""),
            filename: body.filename,
            expiresOn: body.expiresOn,
          });
          return Response.json(
            stored.ok ? { ok: true, id: stored.id } : { ok: false, error: stored.error },
            { status: stored.status },
          );
        } catch (err) {
          return fail(err);
        }
      },
      GET: async ({ params }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const { assertSensitiveFileAccess } = await import("@/lib/server/second-factor");
          await assertSensitiveFileAccess(userId, "provider");
          const row = await authorizeCentreDocument({ userId, documentId: params.id });
          const file = await loadPrivateDoc(row.storage_ref, row.mime, row.filename);
          return privateDocResponse(file);
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
