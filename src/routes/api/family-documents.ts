import { createFileRoute } from "@tanstack/react-router";
import { asUploadPart, inferPrivateDocMime, PRIVATE_DOC_BAD_FILE } from "@/lib/private-docs";
import { readUploadFile } from "@/lib/server/private-docs";

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : message === "Unauthorized"
        ? 401
        : message === "not_found"
          ? 404
          : 400;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/family-documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const view = new URL(request.url).searchParams.get("desk");
          if (view === "centre") {
            const { listCentreFamilyDocs } = await import("@/lib/server/family-vault");
            const documents = await listCentreFamilyDocs(userId);
            return Response.json({ ok: true, documents });
          }
          const { listParentVault } = await import("@/lib/server/family-vault");
          const vault = await listParentVault(userId);
          return Response.json({ ok: true, ...vault });
        } catch (err) {
          return fail(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const type = request.headers.get("content-type") || "";
          if (type.includes("multipart/form-data")) {
            const form = await request.formData();
            const file = asUploadPart(form.get("file"));
            if (!file) throw Object.assign(new Error("bad_file"), { status: 400 });
            const { saveFamilyDocument } = await import("@/lib/server/family-vault");
            const saved = await saveFamilyDocument({
              userId,
              kind: String(form.get("kind") || ""),
              filename: file.name,
              mime: inferPrivateDocMime({ mime: file.type, filename: file.name }),
              body: await readUploadFile(file),
            });
            return Response.json({ ok: true, id: saved.id });
          }
          const body = (await request.json().catch(() => null)) as {
            action?: string;
            documentId?: string;
            daycareId?: string;
            shareId?: string;
          } | null;
          const action = body?.action || "";
          if (action === "share") {
            const { shareFamilyDocument } = await import("@/lib/server/family-vault");
            const saved = await shareFamilyDocument({
              userId,
              documentId: String(body?.documentId || ""),
              daycareId: String(body?.daycareId || ""),
            });
            return Response.json({ ok: true, shareId: saved.shareId });
          }
          if (action === "revoke") {
            const { revokeFamilyShare } = await import("@/lib/server/family-vault");
            await revokeFamilyShare({ userId, shareId: String(body?.shareId || "") });
            return Response.json({ ok: true });
          }
          if (action === "delete") {
            const { deleteFamilyDocument } = await import("@/lib/server/family-vault");
            await deleteFamilyDocument({ userId, documentId: String(body?.documentId || "") });
            return Response.json({ ok: true });
          }
          throw Object.assign(new Error(PRIVATE_DOC_BAD_FILE), { status: 400 });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
