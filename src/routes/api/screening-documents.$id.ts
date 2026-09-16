import { createFileRoute } from "@tanstack/react-router";
import { loadPrivateDoc, privateDocResponse } from "@/lib/server/private-docs";
import { authorizeScreeningDocument } from "@/lib/server/provider-screening";

function fail(err: unknown, fallback = "Request failed") {
  const message = err instanceof Error ? err.message : fallback;
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : message === "Unauthorized" || message === "Not authorized"
        ? 401
        : /not found/i.test(message)
          ? 404
          : 400;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/screening-documents/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const row = await authorizeScreeningDocument({
            userId,
            documentId: params.id,
          });
          const file = await loadPrivateDoc(row.storage_ref, row.storage_mime, row.original_filename);
          return privateDocResponse(file);
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
