import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { parseJournalPhotos } from "@/lib/daily-care";
import { privateMediaEnabled } from "@/lib/features";
import { carePhotosForViewer, clampPrivateTtl } from "@/lib/private-media";

/**
 * Learning-story photos use the same private link rules as the daily log.
 * Flag off: stored values are returned as saved. Flag on: public URLs are dropped.
 */
export const listLearningStories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!privateMediaEnabled()) return { enabled: false as const, items: [] };
    const sql = await getSql();
    const rows = await sql<{ id: string; title: string; body: string; photos: unknown }>`
      select id, title, body, photos
      from learning_stories
      where (
          parent_user_id = ${context.userId}
          or author_user_id = ${context.userId}
          or daycare_id in (select daycare_id from provider_daycares where user_id = ${context.userId})
        )
        and (${data.daycareId} = '' or daycare_id = ${data.daycareId})
      order by created_at desc
      limit 40
    `.catch(() => [] as { id: string; title: string; body: string; photos: unknown }[]);
    const { presignR2Get } = await import("./r2.server");
    const expiresIn = clampPrivateTtl();
    return {
      enabled: true as const,
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        photos: carePhotosForViewer(parseJournalPhotos(row.photos), {
          enabled: true,
          expiresIn,
          sign: (key, ttl) => {
            try {
              return presignR2Get(key, ttl).url;
            } catch {
              return null;
            }
          },
        }).map((photo) => photo.src),
      })),
    };
  });
