/**
 * Parent report of one published review. Stored on the existing safety queue.
 * FEATURE_REVIEW_REPORTS defaults off. No email and no SMS.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { reviewReportsEnabled } from "@/lib/features";
import {
  canReportReview,
  isReviewReportReason,
  reviewReportDetail,
  type ReviewReportReason,
} from "@/lib/review-reports";
import { nid } from "@/lib/utils";

export const reviewReportFlag = createServerFn({ method: "GET" }).handler(async () => reviewReportsEnabled());

export const reportListingReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reviewId: string; reason: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!reviewReportsEnabled()) return { ok: false as const, reason: "off" as const };
    if (!isReviewReportReason(data.reason)) throw new Error("Choose a reason");
    const reviewId = String(data.reviewId || "").trim();
    if (!reviewId) throw new Error("Review not found");
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      user_id: string | null;
      status: string;
    }>`
      select id, daycare_id, user_id, status
      from reviews
      where id = ${reviewId}
      limit 1
    `;
    const review = rows[0];
    if (
      !review ||
      !canReportReview({
        enabled: true,
        status: review.status,
        reporterUserId: context.userId,
        authorUserId: review.user_id,
        reviewId: review.id,
      })
    ) {
      throw new Error("This review cannot be reported");
    }
    const marker = `review:${reviewId}`;
    const existing = await sql<{ id: string }>`
      select id from safety_reports
      where reporter_user_id = ${context.userId}
        and target_kind = 'review'
        and status = 'open'
        and detail like ${marker + "%"}
      limit 1
    `;
    if (existing[0]) return { ok: true as const, duplicate: true as const };
    const who = await sql<{ name: string | null; email: string | null }>`
      select name, email from "user" where id = ${context.userId} limit 1
    `.catch(() => [] as { name: string | null; email: string | null }[]);
    const reason: ReviewReportReason = data.reason;
    await sql`
      insert into safety_reports (
        id, target_kind, daycare_id, reporter_user_id, reporter_name, reporter_email, reason, detail
      ) values (
        ${nid("sr")},
        'review',
        ${review!.daycare_id},
        ${context.userId},
        ${(who[0]?.name || "").trim().slice(0, 120)},
        ${(who[0]?.email || "").trim().slice(0, 200)},
        ${reason},
        ${reviewReportDetail(review.id, data.note || "")}
      )
    `;
    return { ok: true as const, duplicate: false as const };
  });
