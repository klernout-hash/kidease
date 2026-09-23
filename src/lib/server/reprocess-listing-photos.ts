import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";

/**
 * Re-run straighten / sharpen / frame on photos a centre already uploaded.
 * Any daycare id or slug. Catalogue paths and licence files are skipped.
 * Does not change claim status or the Approve → Live gates.
 */
export const reprocessListingPhotos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; slug?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    const daycareId = (data.daycareId || "").trim();
    const slug = (data.slug || "").trim();
    if (!daycareId && !slug) throw new Error("Pass a centre id or slug.");
    const sql = await getSql();
    const rows = daycareId
      ? await sql<{ id: string; slug: string; photos: string | null }>`
          select id, slug, photos from daycares where id = ${daycareId} limit 1
        `
      : await sql<{ id: string; slug: string; photos: string | null }>`
          select id, slug, photos from daycares where slug = ${slug} limit 1
        `;
    const row = rows[0];
    if (!row) throw new Error("Centre not found");
    const { polishStoredPhotoList } = await import("@/lib/server/polish-listing-photo");
    const previous = row.photos ?? "";
    const result = await polishStoredPhotoList(previous);
    if (result.photos !== previous) {
      await sql`
        update daycares
        set photos = ${result.photos},
            last_photo_updated_at = now()
        where id = ${row.id}
      `.catch(async () => {
        await sql`update daycares set photos = ${result.photos} where id = ${row.id}`;
      });
    }
    return {
      ok: true as const,
      daycareId: row.id,
      slug: row.slug,
      polished: result.polished,
      keptOriginal: result.keptOriginal,
      skipped: result.skipped,
    };
  });
