import { createFileRoute } from "@tanstack/react-router";
import { asUploadPart, inferPrivateDocMime, PRIVATE_DOC_BAD_FILE } from "@/lib/private-docs";

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

/**
 * Staff job board resume. Private bucket only (staff-resumes/ prefix).
 * GET ?ref= opens it for the person, or for a hiring centre the person applied
 * to, accepted an invite from, or works at. POST saves the signed-in person's file.
 */
export const Route = createFileRoute("/api/staff-resume")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { staffJobBoardEnabled } = await import("@/lib/features");
          if (!staffJobBoardEnabled()) throw new Error("File not found");
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const ref = new URL(request.url).searchParams.get("ref") || "";
          const { authorizeStaffResume } = await import("@/lib/server/staff-jobs");
          const row = await authorizeStaffResume({ userId, ref });
          if (row.audience === "provider") {
            const { assertSensitiveFileAccess } = await import("@/lib/server/second-factor");
            await assertSensitiveFileAccess(userId, "provider");
          }
          const { loadPrivateDoc, privateDocResponse } = await import("@/lib/server/private-docs");
          const file = await loadPrivateDoc(row.resume_ref, row.resume_mime, row.resume_name);
          return privateDocResponse(file);
        } catch (err) {
          return fail(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const form = await request.formData();
          const file = asUploadPart(form.get("file"));
          if (!file) throw new Error(PRIVATE_DOC_BAD_FILE);
          const { readUploadFile } = await import("@/lib/server/private-docs");
          const { saveStaffResume } = await import("@/lib/server/staff-jobs");
          const saved = await saveStaffResume({
            userId,
            body: await readUploadFile(file),
            mime: inferPrivateDocMime({ mime: file.type, filename: file.name }),
            filename: file.name,
          });
          return Response.json({ ok: true, ref: saved.ref });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
