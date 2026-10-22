import { createFileRoute } from "@tanstack/react-router";
import { loadPrivateDoc } from "@/lib/server/private-docs";

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : message === "Unauthorized"
        ? 401
        : 404;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/family-documents/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const { loadFamilyDocumentFor } = await import("@/lib/server/family-vault");
          const row = await loadFamilyDocumentFor({ userId, documentId: params.id });
          const file = await loadPrivateDoc(row.storageRef, row.mime, row.fileName);
          const safeName = file.filename.replace(/[^\w.-]+/g, "-") || "document";
          return new Response(new Uint8Array(file.body), {
            status: 200,
            headers: {
              "Content-Type": file.mime,
              "Content-Disposition": `attachment; filename="${safeName}"`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "X-Robots-Tag": "noindex, nofollow",
              "Content-Length": String(file.body.byteLength),
            },
          });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
