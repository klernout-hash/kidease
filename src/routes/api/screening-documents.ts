import { createFileRoute } from "@tanstack/react-router";
import { PRIVATE_DOC_BAD_FILE } from "@/lib/private-docs";
import { readUploadFile } from "@/lib/server/private-docs";
import { saveScreeningUpload } from "@/lib/server/provider-screening";

function fail(err: unknown, fallback = "Request failed") {
  const message = err instanceof Error ? err.message : fallback;
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : message === "Unauthorized" || message === "Not authorized"
        ? 401
        : 400;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/screening-documents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) throw new Error(PRIVATE_DOC_BAD_FILE);
          const saved = await saveScreeningUpload({
            userId,
            daycareId: String(form.get("daycareId") || ""),
            personId: String(form.get("personId") || ""),
            kind: String(form.get("kind") || ""),
            body: await readUploadFile(file),
            mime: file.type,
            filename: file.name,
            issuedOn: String(form.get("issuedOn") || ""),
            expiresOn: String(form.get("expiresOn") || ""),
          });
          return Response.json({ ok: true, id: saved.id });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
