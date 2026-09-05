import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { assertTurnstileToken } from "@/lib/server/turnstile";
import { lookupUser, notifyPlatform } from "@/lib/server/notify";
import { requireAdmin } from "@/lib/server/roles";
import type { Review, ReviewStatus } from "@/lib/types";

const MAX_BODY = 2000;
const MAX_SUBMISSIONS_PER_DAY = 3;

type ReviewRow = {
  id: string;
  daycare_id: string;
  user_id: string | null;
  author: string;
  rating: number;
  body: string;
  body_fr: string;
  created_at: string;
  status: ReviewStatus;
  locale: string | null;
  review_note: string | null;
  reviewed_at: string | null;
};

function mapReview(r: ReviewRow): Review & { status: ReviewStatus; userId: string | null } {
  return {
    id: r.id,
    daycareId: r.daycare_id,
    author: r.author,
    rating: r.rating,
    body: r.body,
    bodyFr: r.body_fr,
    createdAt: String(r.created_at),
    status: r.status,
    userId: r.user_id,
  };
}

function clampRating(n: number) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1 || v > 5) throw new Error("Choose a rating from 1 to 5.");
  return v;
}

export const submitListingReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      rating: number;
      body: string;
      locale?: string;
      turnstileToken?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertTurnstileToken(data.turnstileToken);
    const daycareId = data.daycareId.trim();
    const body = data.body.trim();
    if (!daycareId) throw new Error("Missing listing.");
    if (body.length < 12) throw new Error("Please write a short review (at least a sentence).");
    if (body.length > MAX_BODY) throw new Error("Review is too long.");
    const rating = clampRating(data.rating);
    const locale = data.locale === "fr" ? "fr" : "en";
    const sql = await getSql();
    const centre = await sql<{ id: string; name: string; slug: string }>`
      select id, name, slug from daycares where id = ${daycareId} limit 1
    `;
    if (!centre[0]) throw new Error("Listing not found.");

    const existing = await sql<{ id: string; status: string }>`
      select id, status from reviews
      where daycare_id = ${daycareId} and user_id = ${context.userId}
      order by created_at desc
    `.catch(() => [] as Array<{ id: string; status: string }>);
    if (existing.some((r) => r.status === "pending")) {
      throw new Error("Your review is already waiting on KidEase.");
    }
    if (existing.some((r) => r.status === "approved")) {
      throw new Error("You already have an approved review on this listing.");
    }

    const recent = await sql<{ n: number }>`
      select count(*)::int as n from listing_review_attempts
      where user_id = ${context.userId}
        and created_at > now() - interval '24 hours'
    `.catch(() => [{ n: 0 }]);
    if ((recent[0]?.n ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
      throw new Error("Please wait before submitting another review.");
    }

    const actor = await lookupUser(context.userId);
    const author = (actor.name || actor.email || "Parent").trim().slice(0, 80);
    const id = nid("rev");
    const bodyFr = locale === "fr" ? body : "";
    const bodyEn = locale === "fr" ? body : body;

    await sql`
      insert into listing_review_attempts (id, daycare_id, user_id)
      values (${nid("rva")}, ${daycareId}, ${context.userId})
    `.catch(() => undefined);

    await sql`
      insert into reviews (id, daycare_id, author, rating, body, body_fr, user_id, status, locale)
      values (
        ${id},
        ${daycareId},
        ${author},
        ${rating},
        ${bodyEn},
        ${bodyFr},
        ${context.userId},
        'pending',
        ${locale}
      )
    `;

    await notifyPlatform({
      kind: "review",
      title: `Parent review waiting: ${centre[0].name}`,
      daycareName: centre[0].name,
      slug: centre[0].slug,
      actorName: author,
      actorEmail: actor.email,
      detail: `${rating}/5 — pending moderation. KidEase does not invent star ratings.`,
    }).catch(() => undefined);

    return { ok: true as const, status: "pending" as const };
  });

export const getMyListingReview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => daycareId)
  .handler(async ({ context, data: daycareId }) => {
    const sql = await getSql();
    const rows = await sql<ReviewRow>`
      select id, daycare_id, user_id, author, rating, body, body_fr, created_at, status, locale, review_note, reviewed_at
      from reviews
      where daycare_id = ${daycareId} and user_id = ${context.userId}
      order by created_at desc
      limit 1
    `.catch(() => [] as ReviewRow[]);
    return rows[0] ? mapReview(rows[0]) : null;
  });

export type AdminReviewRow = Review & {
  status: ReviewStatus;
  userId: string | null;
  locale: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  centreName: string;
  slug: string;
};

export const listAdminReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<
      ReviewRow & { centre_name: string; slug: string }
    >`
      select r.id, r.daycare_id, r.user_id, r.author, r.rating, r.body, r.body_fr,
        r.created_at, r.status, r.locale, r.review_note, r.reviewed_at,
        d.name as centre_name, d.slug
      from reviews r
      join daycares d on d.id = r.daycare_id
      where coalesce(r.user_id, '') <> ''
      order by
        case r.status when 'pending' then 0 when 'approved' then 1 else 2 end,
        r.created_at desc
      limit 200
    `.catch(() => []);
    return rows.map((r) => ({
      ...mapReview(r),
      locale: r.locale,
      reviewNote: r.review_note,
      reviewedAt: r.reviewed_at,
      centreName: r.centre_name,
      slug: r.slug,
    })) satisfies AdminReviewRow[];
  });

export const decideListingReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reviewId: string; decision: "approve" | "reject"; note?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (data.decision !== "approve" && data.decision !== "reject") {
      throw new Error("Choose approve or reject.");
    }
    const status: ReviewStatus = data.decision === "approve" ? "approved" : "rejected";
    const sql = await getSql();
    const note = (data.note || "").trim().slice(0, 500);
    const updated = await sql<{ id: string }>`
      update reviews
      set status = ${status},
          review_note = ${note || null},
          reviewed_at = now(),
          reviewed_by = ${context.userId}
      where id = ${data.reviewId}
      returning id
    `;
    if (!updated[0]) throw new Error("Review not found.");
    return { ok: true as const, status };
  });
