import { createFileRoute } from "@tanstack/react-router";
import { asUploadPart, inferPrivateDocMime, PRIVATE_DOC_BAD_FILE } from "@/lib/private-docs";
import { readUploadFile } from "@/lib/server/private-docs";
import { saveBackgroundCheckFile } from "@/lib/server/background-check-records";

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  const status = message === "Unauthorized" || message === "Not authorized" ? 401 : 400;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/background-check-files")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const form = await request.formData();
          const file = asUploadPart(form.get("file"));
          if (!file) throw new Error(PRIVATE_DOC_BAD_FILE);
          const saved = await saveBackgroundCheckFile({
            userId,
            recordId: String(form.get("recordId") || ""),
            body: await readUploadFile(file),
            mime: inferPrivateDocMime({ mime: file.type, filename: file.name }),
            filename: file.name,
          });
          return Response.json({ ok: true, id: saved.id });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
