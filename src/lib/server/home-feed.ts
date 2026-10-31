import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { alsoViewed, cleanFeedPreference, homeFeedEnabled, type AlsoViewedRow } from "@/lib/home-feed";

function hashViewer(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export const loadMyFeedPrefs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!homeFeedEnabled()) return { enabled: false as const, prefs: null };
    const sql = await getSql();
    const rows = await sql<{ city: string; province: string; child_age_months: number | null; start_date: string | null }>`
      select city, province, child_age_months, start_date from parent_feed_prefs where user_id = ${context.userId} limit 1
    `;
    const row = rows[0];
    return {
      enabled: true as const,
      prefs: row
        ? cleanFeedPreference({
            city: row.city,
            province: row.province,
            childAgeMonths: row.child_age_months,
            startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
          })
        : null,
    };
  });

export const saveMyFeedPrefs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { city: string; province: string; childAgeMonths: number | null; startDate: string | null }) => input)
  .handler(async ({ context, data }) => {
    if (!homeFeedEnabled()) return { ok: false as const, reason: "off" as const };
    const prefs = cleanFeedPreference(data);
    if (!prefs) return { ok: false as const, reason: "invalid" as const };
    const sql = await getSql();
    await sql`
      insert into parent_feed_prefs (user_id, city, province, child_age_months, start_date, updated_at)
      values (${context.userId}, ${prefs.city}, ${prefs.province}, ${prefs.childAgeMonths}, ${prefs.startDate}, now())
      on conflict (user_id) do update set
        city = excluded.city,
        province = excluded.province,
        child_age_months = excluded.child_age_months,
        start_date = excluded.start_date,
        updated_at = now()
    `;
    return { ok: true as const, prefs };
  });

export const recordAndSuggest = createServerFn({ method: "POST" })
  .validator((input: { listingId: string; city: string; viewer: string }) => input)
  .handler(async ({ data }) => {
    if (!homeFeedEnabled()) return { enabled: false as const, ids: [] as string[] };
    const listingId = String(data.listingId || "").trim().slice(0, 80);
    const city = String(data.city || "").trim().slice(0, 80);
    const viewer = String(data.viewer || "").trim();
    if (!listingId || !city || viewer.length < 8) return { enabled: true as const, ids: [] as string[] };
    const sql = await getSql();
    const cityKey = city
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    await sql`
      insert into listing_viewers (listing_id, city_key, viewer_key)
      values (${listingId}, ${cityKey}, ${hashViewer(viewer)})
      on conflict do nothing
    `;
    const rows = await sql<{ listing_id: string; viewers: number | string }>`
      select listing_id, count(*)::int as viewers
      from listing_viewers
      where city_key = ${cityKey}
      group by listing_id
    `;
    const views: AlsoViewedRow[] = rows.map((row) => ({
      listingId: row.listing_id,
      city,
      viewers: Number(row.viewers) || 0,
    }));
    return { enabled: true as const, ids: alsoViewed({ currentId: listingId, city, views }) };
  });
