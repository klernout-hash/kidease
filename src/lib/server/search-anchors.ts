import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  parseAnchorMode,
  sanitizeAnchorPoint,
  type AnchorMode,
  type AnchorPoint,
} from "@/lib/dual-anchor";

export type SavedSearchAnchors = {
  home: AnchorPoint | null;
  work: AnchorPoint | null;
  mode: AnchorMode;
};

function rowToAnchors(row?: {
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
  work_lat: number | null;
  work_lng: number | null;
  work_label: string | null;
  search_anchor_mode: string | null;
}): SavedSearchAnchors {
  return {
    home: sanitizeAnchorPoint({
      lat: row?.home_lat,
      lng: row?.home_lng,
      label: row?.home_label,
    }),
    work: sanitizeAnchorPoint({
      lat: row?.work_lat,
      lng: row?.work_lng,
      label: row?.work_label,
    }),
    mode: parseAnchorMode(row?.search_anchor_mode),
  };
}

export const getMySearchAnchors = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SavedSearchAnchors> => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, role) values (${context.userId}, 'parent')
      on conflict (user_id) do nothing
    `;
    const rows = await sql<{
      home_lat: number | null;
      home_lng: number | null;
      home_label: string | null;
      work_lat: number | null;
      work_lng: number | null;
      work_label: string | null;
      search_anchor_mode: string | null;
    }>`
      select home_lat, home_lng, home_label, work_lat, work_lng, work_label, search_anchor_mode
      from profiles
      where user_id = ${context.userId}
      limit 1
    `;
    return rowToAnchors(rows[0]);
  });

export const saveMySearchAnchors = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { home?: AnchorPoint | null; work?: AnchorPoint | null; mode?: unknown }) => ({
    home: input?.home ? sanitizeAnchorPoint(input.home) : null,
    work: input?.work ? sanitizeAnchorPoint(input.work) : null,
    mode: parseAnchorMode(input?.mode),
  }))
  .handler(async ({ context, data }): Promise<SavedSearchAnchors> => {
    const sql = await getSql();
    await sql`
      insert into profiles (
        user_id, role, home_lat, home_lng, home_label, work_lat, work_lng, work_label, search_anchor_mode
      )
      values (
        ${context.userId}, 'parent',
        ${data.home?.lat ?? null}, ${data.home?.lng ?? null}, ${data.home?.label ?? null},
        ${data.work?.lat ?? null}, ${data.work?.lng ?? null}, ${data.work?.label ?? null},
        ${data.mode}
      )
      on conflict (user_id) do update set
        home_lat = excluded.home_lat,
        home_lng = excluded.home_lng,
        home_label = excluded.home_label,
        work_lat = excluded.work_lat,
        work_lng = excluded.work_lng,
        work_label = excluded.work_label,
        search_anchor_mode = excluded.search_anchor_mode
    `;
    return data;
  });
