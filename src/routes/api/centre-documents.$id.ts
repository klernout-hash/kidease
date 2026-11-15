import { createFileRoute } from "@tanstack/react-router";
import { authorizeCentreDocument } from "@/lib/server/centre-documents";
import { loadPrivateDoc, privateDocResponse } from "@/lib/server/private-docs";

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  const status = /not authorized|only update|only open/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/centre-documents/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
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
