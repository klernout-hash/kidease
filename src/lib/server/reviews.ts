import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { assertTurnstileToken } from "@/lib/server/turnstile";
import { lookupUser, notifyPlatform } from "@/lib/server/notify";
import { requireAdmin } from "@/lib/server/roles";
import {
  ENROLLED_BOOKING_STATUSES,
  isPendingReviewStatus,
  isPublicReviewStatus,
  normalizeReviewStatus,
  parentReviewSummary,
  resolveReviewWriteAccess,
  type ReviewGateReason,
  type ReviewModerationStatus,
  type ReviewWriteAccess,
} from "@/lib/review-gate";
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
  gate_reason?: string | null;
};

function mapReview(r: ReviewRow): Review & { status: ReviewModerationStatus; userId: string | null } {
  const gate = r.gate_reason;
  return {
    id: r.id,
    daycareId: r.daycare_id,
    author: r.author,
    rating: r.rating,
    body: r.body,
    bodyFr: r.body_fr,
    createdAt: String(r.created_at),
    status: normalizeReviewStatus(r.status),
    userId: r.user_id,
    gateReason: (gate === "enrolment" || gate === "attendance" || gate === "grant"
      ? gate
      : null) as ReviewGateReason | null,
  };
}

function clampRating(n: number) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1 || v > 5) throw new Error("Choose a rating from 1 to 5.");
  return v;
}

async function ownsCentre(sql: Sql, userId: string, daycareId: string) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from provider_daycares
    where user_id = ${userId} and daycare_id = ${daycareId}
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

async function hasEnrolment(sql: Sql, userId: string, daycareId: string) {
  const accepted = ENROLLED_BOOKING_STATUSES[0];
  const active = ENROLLED_BOOKING_STATUSES[1];
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from bookings
    where user_id = ${userId}
      and daycare_id = ${daycareId}
      and status in (${accepted}, ${active})
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

async function hasAttendance(sql: Sql, userId: string, daycareId: string) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from attendance
    where parent_user_id = ${userId} and daycare_id = ${daycareId}
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

async function hasReviewerGrant(sql: Sql, userId: string, daycareId: string) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from reviewer_grants
    where user_id = ${userId} and daycare_id = ${daycareId}
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

async function loadMyReview(sql: Sql, daycareId: string, userId: string) {
  const withGate = await sql<ReviewRow>`
    select id, daycare_id, user_id, author, rating, body, body_fr, created_at, status, locale, review_note, reviewed_at, gate_reason
    from reviews
    where daycare_id = ${daycareId} and user_id = ${userId}
    order by created_at desc
    limit 1
  `.catch(() => null);
  if (withGate) return withGate;
  return sql<ReviewRow>`
    select id, daycare_id, user_id, author, rating, body, body_fr, created_at, status, locale, review_note, reviewed_at
    from reviews
    where daycare_id = ${daycareId} and user_id = ${userId}
    order by created_at desc
    limit 1
  `.catch(() => [] as ReviewRow[]);
}

export async function evaluateReviewWriteAccess(
  sql: Sql,
  userId: string,
  daycareId: string,
): Promise<ReviewWriteAccess> {
  return resolveReviewWriteAccess({
    ownsCentre: await ownsCentre(sql, userId, daycareId),
    enrolled: await hasEnrolment(sql, userId, daycareId),
    attended: await hasAttendance(sql, userId, daycareId),
    granted: await hasReviewerGrant(sql, userId, daycareId),
  });
}

export type ParentReviewStats = { parentRatingX10: number; parentReviewCount: number };

export async function loadParentReviewStats(
  sql: Sql,
  daycareIds: string[],
): Promise<Map<string, ParentReviewStats>> {
  const out = new Map<string, ParentReviewStats>();
  if (!daycareIds.length) return out;
  const wanted = new Set(daycareIds);
  const rows = await sql<{ daycare_id: string; rating: number }>`
    select daycare_id, rating from reviews
    where status in ('published', 'approved')
      and coalesce(user_id, '') <> ''
  `.catch(() => [] as Array<{ daycare_id: string; rating: number }>);
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    if (!wanted.has(row.daycare_id)) continue;
    const list = grouped.get(row.daycare_id) ?? [];
    list.push(Number(row.rating));
    grouped.set(row.daycare_id, list);
  }
  for (const [id, ratings] of grouped) {
    const summary = parentReviewSummary(ratings.map((rating) => ({ rating })));
    out.set(id, { parentRatingX10: summary.ratingX10, parentReviewCount: summary.count });
  }
  return out;
}

export async function overlayParentReviews<T extends { id: string }>(items: T[]): Promise<T[]> {
  if (!items.length) return items;
  try {
    const sql = await getSql();
    const stats = await loadParentReviewStats(
      sql,
      [...new Set(items.map((item) => item.id))],
    );
    return items.map((item) => {
      const hit = stats.get(item.id);
      if (!hit) return { ...item, parentRatingX10: 0, parentReviewCount: 0 } as T;
      return { ...item, ...hit } as T;
    });
  } catch {
    return items.map((item) => ({ ...item, parentRatingX10: 0, parentReviewCount: 0 }) as T);
  }
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

    const access = await evaluateReviewWriteAccess(sql, context.userId, daycareId);
    if (!access.canWrite) {
      if (access.reason === "centre_owner") {
        throw new Error("Centres cannot write reviews on their own listing.");
      }
      throw new Error(
        "Reviews are only from parents with a confirmed enrolment or in-care relationship.",
      );
    }

    const existing = await sql<{ id: string; status: string }>`
      select id, status from reviews
      where daycare_id = ${daycareId} and user_id = ${context.userId}
      order by created_at desc
    `.catch(() => [] as Array<{ id: string; status: string }>);
    if (existing.some((r) => isPendingReviewStatus(r.status))) {
      throw new Error("Your review is already waiting on KidEase.");
    }
    if (existing.some((r) => isPublicReviewStatus(r.status))) {
      throw new Error("You already have a published review on this listing.");
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
    const gateReason: ReviewGateReason = access.reason;

    await sql`
      insert into listing_review_attempts (id, daycare_id, user_id)
      values (${nid("rva")}, ${daycareId}, ${context.userId})
    `.catch(() => undefined);

    try {
      await sql`
        insert into reviews (id, daycare_id, author, rating, body, body_fr, user_id, status, locale, gate_reason)
        values (
          ${id},
          ${daycareId},
          ${author},
          ${rating},
          ${bodyEn},
          ${bodyFr},
          ${context.userId},
          'pending',
          ${locale},
          ${gateReason}
        )
      `;
    } catch {
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
    }

    await notifyPlatform({
      kind: "review",
      title: `Parent review waiting: ${centre[0].name}`,
      daycareName: centre[0].name,
      slug: centre[0].slug,
      actorName: author,
      actorEmail: actor.email,
      detail: `${rating}/5 — pending moderation (${gateReason}). KidEase does not invent star ratings.`,
    }).catch(() => undefined);

    return { ok: true as const, status: "pending" as const, gateReason };
  });

export const getListingReviewAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => daycareId)
  .handler(async ({ context, data: daycareId }) => {
    const sql = await getSql();
    const access = await evaluateReviewWriteAccess(sql, context.userId, daycareId);
    const rows = await loadMyReview(sql, daycareId, context.userId);
    return {
      ...access,
      mine: rows[0] ? mapReview(rows[0]) : null,
    };
  });

export const getMyListingReview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => daycareId)
  .handler(async ({ context, data: daycareId }) => {
    const sql = await getSql();
    const rows = await loadMyReview(sql, daycareId, context.userId);
    return rows[0] ? mapReview(rows[0]) : null;
  });

export type AdminReviewRow = Review & {
  status: ReviewModerationStatus;
  userId: string | null;
  locale: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  centreName: string;
  slug: string;
  gateReason: ReviewGateReason | null;
};

export const listAdminReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows =
      (await sql<ReviewRow & { centre_name: string; slug: string }>`
        select r.id, r.daycare_id, r.user_id, r.author, r.rating, r.body, r.body_fr,
          r.created_at, r.status, r.locale, r.review_note, r.reviewed_at, r.gate_reason,
          d.name as centre_name, d.slug
        from reviews r
        join daycares d on d.id = r.daycare_id
        where coalesce(r.user_id, '') <> ''
        order by
          case r.status when 'pending' then 0 when 'published' then 1 when 'approved' then 1 else 2 end,
          r.created_at desc
        limit 200
      `.catch(() => null)) ??
      (await sql<ReviewRow & { centre_name: string; slug: string }>`
        select r.id, r.daycare_id, r.user_id, r.author, r.rating, r.body, r.body_fr,
          r.created_at, r.status, r.locale, r.review_note, r.reviewed_at,
          d.name as centre_name, d.slug
        from reviews r
        join daycares d on d.id = r.daycare_id
        where coalesce(r.user_id, '') <> ''
        order by
          case r.status when 'pending' then 0 when 'published' then 1 when 'approved' then 1 else 2 end,
          r.created_at desc
        limit 200
      `.catch(() => []));
    return rows.map((r) => {
      const mapped = mapReview(r);
      return {
        ...mapped,
        locale: r.locale,
        reviewNote: r.review_note,
        reviewedAt: r.reviewed_at,
        centreName: r.centre_name,
        slug: r.slug,
        gateReason: mapped.gateReason ?? null,
      };
    }) satisfies AdminReviewRow[];
  });

export type ReviewDecision = "publish" | "hide" | "approve" | "reject";

function decisionToStatus(decision: ReviewDecision): ReviewModerationStatus {
  if (decision === "publish" || decision === "approve") return "published";
  if (decision === "hide" || decision === "reject") return "hidden";
  throw new Error("Choose publish or hide.");
}

export const decideListingReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reviewId: string; decision: ReviewDecision; note?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const status = decisionToStatus(data.decision);
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

export const grantListingReviewer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; daycareId: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const userId = data.userId.trim();
    const daycareId = data.daycareId.trim();
    if (!userId || !daycareId) throw new Error("Parent and listing are required.");
    const sql = await getSql();
    const centre = await sql<{ id: string }>`
      select id from daycares where id = ${daycareId} limit 1
    `;
    if (!centre[0]) throw new Error("Listing not found.");
    if (await ownsCentre(sql, userId, daycareId)) {
      throw new Error("Cannot grant a reviewer flag to the centre account.");
    }
    const note = (data.note || "").trim().slice(0, 500);
    await sql`
      insert into reviewer_grants (user_id, daycare_id, granted_by, note)
      values (${userId}, ${daycareId}, ${context.userId}, ${note || null})
      on conflict (user_id, daycare_id) do update
        set granted_by = excluded.granted_by,
            note = excluded.note,
            created_at = now()
    `;
    return { ok: true as const };
  });
