import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  isReviewModerationAction,
  isSafetyReason,
  isSafetyStatus,
  isSafetyTarget,
  messageIsBlocked,
  viewerHasBlocked,
  type SafetyBlock,
  type SafetyTarget,
} from "@/lib/safety";
import { requireAdmin } from "@/lib/server/roles";
import { requireConversationRead } from "@/lib/server/thread-access";
import { nid } from "@/lib/utils";

async function centreUserIds(sql: Sql, daycareId: string): Promise<string[]> {
  const owners = await sql<{ user_id: string }>`
    select user_id from provider_daycares where daycare_id = ${daycareId}
  `.catch(() => [] as { user_id: string }[]);
  const staff = await sql<{ user_id: string }>`
    select user_id from centre_members where daycare_id = ${daycareId}
  `.catch(() => [] as { user_id: string }[]);
  return [...new Set([...owners, ...staff].map((row) => row.user_id).filter(Boolean))];
}

async function loadBlocks(sql: Sql, parentUserId: string, daycareId: string): Promise<SafetyBlock[]> {
  const rows = await sql<{
    blocker_user_id: string;
    blocked_user_id: string | null;
    daycare_id: string | null;
  }>`
    select blocker_user_id, blocked_user_id, daycare_id
    from safety_blocks
    where daycare_id = ${daycareId}
       or blocker_user_id = ${parentUserId}
       or blocked_user_id = ${parentUserId}
  `.catch(() => []);
  return rows.map((row) => ({
    blockerUserId: row.blocker_user_id,
    blockedUserId: row.blocked_user_id,
    daycareId: row.daycare_id,
  }));
}

async function reporterIdentity(sql: Sql, userId: string) {
  const rows = await sql<{ name: string | null; email: string | null }>`
    select name, email from "user" where id = ${userId} limit 1
  `.catch(() => [] as { name: string | null; email: string | null }[]);
  return {
    name: (rows[0]?.name || "").trim().slice(0, 120) || null,
    email: (rows[0]?.email || "").trim().slice(0, 200) || null,
  };
}

export const reportSafety = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { target: string; reason: string; detail?: string; daycareId?: string; conversationId?: string; reviewId?: string }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    if (!isSafetyTarget(data.target) || !isSafetyReason(data.reason)) throw new Error("Choose a reason");
    const sql = await getSql();
    const target: SafetyTarget = data.target;
    let daycareId: string | null = null;
    let conversationId: string | null = null;
    let reportedUserId: string | null = null;
    let reviewId: string | null = null;

    if (target === "review") {
      reviewId = (data.reviewId || "").trim();
      daycareId = (data.daycareId || "").trim();
      if (!reviewId || !daycareId) throw new Error("Review not found");
      const review = await sql<{ id: string }>`
        select id from reviews where id = ${reviewId} and daycare_id = ${daycareId} limit 1
      `;
      if (!review[0]) throw new Error("Review not found");
    } else if (target === "thread") {
      const id = (data.conversationId || "").trim();
      if (!id) throw new Error("Conversation not found");
      const access = await requireConversationRead(sql, id, context.userId);
      conversationId = access.conversation.id;
      daycareId = access.conversation.daycare_id;
      reportedUserId =
        context.userId === access.conversation.user_id ? null : access.conversation.user_id;
    } else {
      daycareId = (data.daycareId || "").trim();
      if (!daycareId) throw new Error("Listing not found");
      const listed = await sql<{ id: string }>`
        select id from daycares where id = ${daycareId} limit 1
      `;
      if (!listed[0]) throw new Error("Listing not found");
    }

    const who = await reporterIdentity(sql, context.userId);
    const detail = (data.detail || "").trim().slice(0, 2000) || null;
    await sql`
      insert into safety_reports (
        id, target_kind, daycare_id, conversation_id, reported_user_id, review_id,
        reporter_user_id, reporter_name, reporter_email, reason, detail
      ) values (
        ${nid("sr")},
        ${target},
        ${daycareId},
        ${conversationId},
        ${reportedUserId},
        ${reviewId},
        ${context.userId},
        ${who.name},
        ${who.email},
        ${data.reason},
        ${detail}
      )
    `;
    return { ok: true as const };
  });

export const safetyThreadState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await requireConversationRead(sql, data.conversationId, context.userId);
    const parentUserId = access.conversation.user_id;
    const daycareId = access.conversation.daycare_id;
    const centres = await centreUserIds(sql, daycareId);
    const blocks = await loadBlocks(sql, parentUserId, daycareId);
    return {
      blocked: viewerHasBlocked({
        viewerId: context.userId,
        parentUserId,
        daycareId,
        centreUserIds: centres,
        blocks,
      }),
    };
  });

export const setMessageBlock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; blocked: boolean }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const sql = await getSql();
    const access = await requireConversationRead(sql, data.conversationId, context.userId);
    const parentUserId = access.conversation.user_id;
    const daycareId = access.conversation.daycare_id;
    const centres = await centreUserIds(sql, daycareId);
    const viewer = context.userId;

    if (!data.blocked) {
      await sql`
        delete from safety_blocks
        where blocker_user_id = ${viewer}
          and (
            daycare_id = ${daycareId}
            or blocked_user_id = ${parentUserId}
            or blocked_user_id in (select user_id from provider_daycares where daycare_id = ${daycareId})
          )
      `;
      return { ok: true as const, blocked: false as const };
    }

    if (viewer === parentUserId) {
      const existing = await sql<{ id: string }>`
        select id from safety_blocks
        where blocker_user_id = ${viewer} and daycare_id = ${daycareId} and blocked_user_id is null
        limit 1
      `;
      if (!existing[0]) {
        await sql`
          insert into safety_blocks (id, blocker_user_id, daycare_id)
          values (${nid("sb")}, ${viewer}, ${daycareId})
        `;
      }
      for (const centreUserId of centres) {
        if (!centreUserId || centreUserId === viewer) continue;
        const pair = await sql<{ id: string }>`
          select id from safety_blocks
          where blocker_user_id = ${viewer} and blocked_user_id = ${centreUserId}
          limit 1
        `;
        if (pair[0]) continue;
        await sql`
          insert into safety_blocks (id, blocker_user_id, blocked_user_id, daycare_id)
          values (${nid("sb")}, ${viewer}, ${centreUserId}, ${daycareId})
        `;
      }
    } else {
      const pair = await sql<{ id: string }>`
        select id from safety_blocks
        where blocker_user_id = ${viewer} and blocked_user_id = ${parentUserId}
        limit 1
      `;
      if (!pair[0]) {
        await sql`
          insert into safety_blocks (id, blocker_user_id, blocked_user_id, daycare_id)
          values (${nid("sb")}, ${viewer}, ${parentUserId}, ${daycareId})
        `;
      }
    }
    return { ok: true as const, blocked: true as const };
  });

export async function assertChatNotBlocked(
  sql: Sql,
  input: { senderId: string; parentUserId: string; daycareId: string },
): Promise<void> {
  const centres = await centreUserIds(sql, input.daycareId);
  const blocks = await loadBlocks(sql, input.parentUserId, input.daycareId);
  if (
    messageIsBlocked({
      senderId: input.senderId,
      parentUserId: input.parentUserId,
      daycareId: input.daycareId,
      centreUserIds: centres,
      blocks,
    })
  ) {
    const error = new Error("safety_blocked");
    throw error;
  }
}

export type SafetyQueueRow = {
  id: string;
  target: string;
  reason: string;
  detail: string | null;
  status: string;
  daycareName: string | null;
  city: string | null;
  province: string | null;
  reporterEmail: string | null;
  reviewId: string | null;
  createdAt: string;
};

export const listSafetyQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      target_kind: string;
      reason: string;
      detail: string | null;
      status: string;
      name: string | null;
      city: string | null;
      province: string | null;
      reporter_email: string | null;
      review_id: string | null;
      created_at: string;
    }>`
      select r.id, r.target_kind, r.reason, r.detail, r.status,
             d.name, d.city, d.province, r.reporter_email, r.review_id, r.created_at
      from safety_reports r
      left join daycares d on d.id = r.daycare_id
      where r.status = 'open'
      order by r.created_at asc
      limit 80
    `.catch(() => []);
    return rows.map(
      (row): SafetyQueueRow => ({
        id: row.id,
        target: row.target_kind,
        reason: row.reason,
        detail: row.detail,
        status: row.status,
        daycareName: row.name,
        city: row.city,
        province: row.province,
        reporterEmail: row.reporter_email,
        reviewId: row.review_id,
        createdAt: row.created_at,
      }),
    );
  });

export const reviewSafetyReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: string }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    await requireAdmin(context.userId);
    const reviewAction = isReviewModerationAction(data.status);
    const reportAction = isSafetyStatus(data.status) && data.status !== "open";
    if (!reviewAction && !reportAction) throw new Error("Choose a result");
    const sql = await getSql();
    const open = await sql<{ id: string; target_kind: string; review_id: string | null }>`
      select id, target_kind, review_id
      from safety_reports
      where id = ${data.id} and status = 'open'
      limit 1
    `;
    const row = open[0];
    if (!row) throw new Error("Report not found");
    if (reviewAction && row.target_kind !== "review") throw new Error("That action is for a review");
    if (!reviewAction && row.target_kind === "review") throw new Error("Choose a review action");
    if (reviewAction && row.review_id && data.status !== "keep_review") {
      const note = data.status === "remove_review" ? "Removed after a report" : "Hidden after a report";
      await sql`
        update reviews
        set status = 'hidden', review_note = ${note}, reviewed_at = now()
        where id = ${row.review_id}
      `;
    }
    const wrote = await sql<{ id: string }>`
      update safety_reports
      set status = 'reviewed',
          reviewed_at = now(),
          reviewed_by = ${context.userId}
      where id = ${data.id} and status = 'open'
      returning id
    `;
    if (!wrote[0]) throw new Error("Report not found");
    if (!reviewAction && data.status === "dismissed") {
      await sql`update safety_reports set status = 'dismissed' where id = ${data.id}`;
    }
    return { ok: true as const };
  });
