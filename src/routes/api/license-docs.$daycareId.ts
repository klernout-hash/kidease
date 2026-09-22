import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { asUploadPart, inferPrivateDocMime, PRIVATE_DOC_BAD_FILE } from "@/lib/private-docs";
import { assertCentreCanMutateListing, loadCentreRole } from "@/lib/server/centre-access";
import {
  licenseObjectTail,
  loadPrivateDoc,
  persistPrivateDoc,
  privateDocResponse,
  readUploadFile,
} from "@/lib/server/private-docs";
import { R2_LICENSE_PREFIX } from "@/lib/server/r2";
import { resolveAdminAccess } from "@/lib/server/roles";
import { overlayStoredLicensePhotos, writeStoredLicensePhoto } from "@/lib/server/license-photo-ref";
import { writeTrustEvent } from "@/lib/server/trust";

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

async function authorizeLicenseDoc(userId: string, daycareId: string, write: boolean): Promise<"admin" | "centre"> {
  const admin = (await resolveAdminAccess(userId)).ok;
  if (admin) return "admin";
  if (write) {
    await assertCentreCanMutateListing(await getSql(), userId, daycareId);
    return "centre";
  }
  const role = await loadCentreRole(await getSql(), userId, daycareId);
  if (!role) throw new Error("Not authorized");
  return "centre";
}

export const Route = createFileRoute("/api/license-docs/$daycareId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const daycareId = params.daycareId;
          await authorizeLicenseDoc(userId, daycareId, false);
          const sql = await getSql();
          const rows = await sql<{
            daycare_id: string;
            license_photo: string | null;
          }>`
            select d.id as daycare_id,
              coalesce(nullif(btrim(c.license_photo), ''), nullif(btrim(d.license_photo), '')) as license_photo
            from daycares d
            left join listing_claims c on c.daycare_id = d.id
            where d.id = ${daycareId}
            order by c.created_at desc nulls last
            limit 1
          `.catch(() => []);
          const [filled] = await overlayStoredLicensePhotos(sql, rows);
          const ref = filled?.license_photo;
          if (!ref) throw new Error("File not found");
          return privateDocResponse(await loadPrivateDoc(ref, null, "licence"));
        } catch (err) {
          return fail(err);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const daycareId = params.daycareId;
          const actor = await authorizeLicenseDoc(userId, daycareId, true);
          const form = await request.formData();
          const file = asUploadPart(form.get("file"));
          if (!file) throw new Error(PRIVATE_DOC_BAD_FILE);
          const stored = await persistPrivateDoc({
            prefix: R2_LICENSE_PREFIX,
            keyTail: licenseObjectTail(daycareId),
            body: await readUploadFile(file),
            mime: inferPrivateDocMime({ mime: file.type, filename: file.name }),
          });
          const sql = await getSql();
          await writeStoredLicensePhoto(sql, {
            daycareId,
            storageRef: stored.storageRef,
            claimScope: actor === "admin" ? "daycare" : "actor",
            actorUserId: userId,
          });
          await writeTrustEvent(sql, {
            daycareId,
            actorUserId: userId,
            kind: "license_photo",
            note:
              actor === "admin"
                ? "Admin attached the provincial licence document."
                : "Provincial licence document uploaded for Admin review.",
          }).catch(() => undefined);
          return Response.json({ ok: true, mime: stored.mime });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
