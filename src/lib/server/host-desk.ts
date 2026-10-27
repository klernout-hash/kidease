import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { dollarsToCents } from "@/lib/bill";
import { getSql } from "@/lib/db";
import {
  shapeHostEarnings,
  type HostBill,
  type HostEarnings,
  type HostInsights,
  type WrittenReview,
} from "@/lib/host-desk";
import { menuReviewSummary, type RatedListing } from "@/lib/menu-summary";

export type { HostEarnings, HostInsights };

const REVIEW_LIMIT = 12;
const BILL_LIMIT = 40;

export const loadHostEarnings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<HostEarnings> => {
    try {
      const sql = await getSql();
      const rows = await sql<{
        id: string;
        number: string | null;
        status: string;
        period: string | null;
        paid_at: string | null;
        due_at: string | null;
        net_cents: number | null;
        amount_cents: number | null;
        platform_fee_cents: number | null;
        total: number | null;
        platform_fee: number | null;
        parent_name: string | null;
        child_name: string | null;
        centre_name: string | null;
      }>`
        select i.id, i.number, i.status, i.period, i.paid_at, i.due_at,
          i.net_cents, i.amount_cents, i.platform_fee_cents, i.total, i.platform_fee,
          u.name as parent_name, ch.name as child_name, d.name as centre_name
        from invoices i
        join provider_daycares p on p.daycare_id = i.daycare_id
        left join daycares d on d.id = i.daycare_id
        left join "user" u on u.id = i.parent_user_id
        left join children ch on ch.id = i.child_id
        where p.user_id = ${context.userId}
          and i.status in ('paid', 'sent')
        order by coalesce(i.paid_at, i.due_at, i.created_at) desc
        limit ${BILL_LIMIT}
      `;
      const bills: HostBill[] = rows.map((row) => ({
        id: row.id,
        status: row.status,
        netCents: netCents(row),
        period: row.period,
        paidAt: row.paid_at,
        dueAt: row.due_at,
        parentName: row.parent_name,
        childName: row.child_name,
        number: row.number,
        centreName: row.centre_name,
      }));
      return shapeHostEarnings(bills);
    } catch {
      return { ok: false, thisMonthCents: null, bars: [], paid: [], upcoming: [] };
    }
  });

export const loadHostInsights = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<HostInsights> => {
    const empty: HostInsights = {
      ok: false,
      listingRatingX10: null,
      listingReviewCount: null,
      parentRatingX10: null,
      parentReviewCount: null,
      reviews: [],
      viewCount: null,
      requestCount: null,
      tourCount: null,
    };
    try {
      const sql = await getSql();
      const userId = context.userId;
      const listings = await sql<{ rating_x10: number | null; review_count: number | null; slug: string | null }>`
        select d.rating_x10, d.review_count, d.slug
        from daycares d
        join provider_daycares p on p.daycare_id = d.id
        where p.user_id = ${userId}
      `.catch(() => []);
      const rated: RatedListing[] = listings.map((row) => ({
        ratingX10: Number(row.rating_x10) || 0,
        reviewCount: Number(row.review_count) || 0,
        slug: row.slug,
      }));
      const listing = menuReviewSummary(rated);
      const reviewRows = await sql<{
        id: string;
        author: string;
        rating: number;
        body: string;
        body_fr: string;
        created_at: string;
        centre_name: string | null;
      }>`
        select r.id, r.author, r.rating, r.body, r.body_fr, r.created_at, d.name as centre_name
        from reviews r
        join provider_daycares p on p.daycare_id = r.daycare_id
        join daycares d on d.id = r.daycare_id
        where p.user_id = ${userId}
          and r.status in ('published', 'approved')
        order by r.created_at desc
        limit ${REVIEW_LIMIT}
      `.catch(() => []);
      const reviews: WrittenReview[] = reviewRows.map((row) => ({
        id: row.id,
        author: row.author,
        rating: Number(row.rating) || 0,
        body: row.body || "",
        bodyFr: row.body_fr || "",
        createdAt: String(row.created_at),
        centreName: row.centre_name,
      }));
      const parentRows = await sql<{ n: number; total: number }>`
        select count(*)::int as n, coalesce(sum(r.rating), 0)::int as total
        from reviews r
        join provider_daycares p on p.daycare_id = r.daycare_id
        where p.user_id = ${userId}
          and r.status in ('published', 'approved')
          and r.rating between 1 and 5
      `.catch(() => []);
      const parentCount = Number(parentRows[0]?.n) || 0;
      const parentTotal = Number(parentRows[0]?.total) || 0;
      const parents =
        parentCount > 0 ? { ratingX10: Math.round((parentTotal / parentCount) * 10), reviewCount: parentCount } : null;
      const [viewCount, requestCount, tourCount] = await Promise.all([
        countFor(sql, userId, "views"),
        countFor(sql, userId, "requests"),
        countFor(sql, userId, "tours"),
      ]);
      return {
        ok: true,
        listingRatingX10: listing?.ratingX10 ?? null,
        listingReviewCount: listing?.reviewCount ?? null,
        parentRatingX10: parents?.ratingX10 ?? null,
        parentReviewCount: parents?.reviewCount ?? null,
        reviews,
        viewCount,
        requestCount,
        tourCount,
      };
    } catch {
      return empty;
    }
  });

async function countFor(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  kind: "views" | "requests" | "tours",
): Promise<number | null> {
  try {
    if (kind === "views") {
      const rows = await sql<{ n: number }>`
        select coalesce(sum(v.count), 0)::int as n
        from daycare_views v
        join provider_daycares p on p.daycare_id = v.daycare_id
        where p.user_id = ${userId}
      `;
      return finiteCount(rows[0]?.n);
    }
    if (kind === "requests") {
      const rows = await sql<{ n: number }>`
        select count(*)::int as n
        from lead_requests lr
        join provider_daycares p on p.daycare_id = lr.daycare_id
        where p.user_id = ${userId}
      `;
      return finiteCount(rows[0]?.n);
    }
    const rows = await sql<{ n: number }>`
      select count(*)::int as n
      from tour_requests t
      join provider_daycares p on p.daycare_id = t.daycare_id
      where p.user_id = ${userId}
    `;
    return finiteCount(rows[0]?.n);
  } catch {
    return null;
  }
}

function finiteCount(value: number | null | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function netCents(row: {
  net_cents: number | null;
  amount_cents: number | null;
  platform_fee_cents: number | null;
  total: number | null;
  platform_fee: number | null;
}): number {
  if (row.net_cents != null && Number.isFinite(Number(row.net_cents))) return Number(row.net_cents);
  const amount = row.amount_cents != null ? Number(row.amount_cents) : dollarsToCents(Number(row.total) || 0);
  const fee =
    row.platform_fee_cents != null ? Number(row.platform_fee_cents) : dollarsToCents(Number(row.platform_fee) || 0);
  return Math.max(0, amount - fee);
}
