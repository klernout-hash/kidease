import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { INVOICE_READ_MODEL_SQL, INVOICE_SETTLED_SQL } from "@/lib/invoice-read-model";
import { earningsThisMonthCents, menuReviewSummary, type MonthBill, type RatedListing } from "@/lib/menu-summary";

export type MenuProviderCards = {
  earningsCents: number | null;
  ratingX10: number | null;
  reviewCount: number | null;
  reviewSlug: string | null;
};

const EMPTY: MenuProviderCards = {
  earningsCents: null,
  ratingX10: null,
  reviewCount: null,
  reviewSlug: null,
};

/**
 * Real earnings and Google ratings for the signed-in centre owner.
 * Missing rows stay null so the menu hides the card.
 */
export const loadMenuProviderCards = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MenuProviderCards> => {
    try {
      const sql = await getSql();
      const bills = await sql.query<{
        status: string;
        period: string | null;
        paid_at: string | null;
        net_cents: number | null;




      }>(`
        select i.status, i.period, i.paid_at, i.read_net_cents as net_cents
        from ${INVOICE_READ_MODEL_SQL} i
        where ${INVOICE_SETTLED_SQL}
          and exists (
            select 1 from provider_daycares p
            where p.user_id = $1 and p.daycare_id = i.daycare_id
          )
      `, [context.userId]).catch(() => []);
      const reviews = await sql<{ rating_x10: number | null; review_count: number | null; slug: string | null }>`
        select d.rating_x10, d.review_count, d.slug
        from daycares d
        join provider_daycares p on p.daycare_id = d.id
        where p.user_id = ${context.userId}
      `.catch(() => []);
      const monthBills: MonthBill[] = bills.map((row) => ({
        status: row.status,
        period: row.period,
        paidAt: row.paid_at,
        netCents: Number(row.net_cents),
      }));
      const rated: RatedListing[] = reviews.map((row) => ({
        ratingX10: Number(row.rating_x10) || 0,
        reviewCount: Number(row.review_count) || 0,
        slug: row.slug,
      }));
      const summary = menuReviewSummary(rated);
      return {
        earningsCents: earningsThisMonthCents(monthBills),
        ratingX10: summary?.ratingX10 ?? null,
        reviewCount: summary?.reviewCount ?? null,
        reviewSlug: summary?.slug ?? null,
      };
    } catch {
      return EMPTY;
    }
  });
