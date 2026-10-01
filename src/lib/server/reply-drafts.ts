import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { AI_FLAGS } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { scrubText } from "@/lib/ai/pii";
import { groundReplyDraft, replyDraftModelUser, replyDraftSchema, REPLY_DRAFT_SYSTEM, type ReplyDraftFacts } from "@/lib/ai/reply-drafts";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireConversationWrite } from "@/lib/server/thread-access";

async function ipHashFor(userId: string): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIpFromHeaders } = await import("@/lib/server-fn-throttle");
    const ip = clientIpFromHeaders(getRequest().headers) || userId;
    return createHash("sha256").update(ip).digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update(userId).digest("hex").slice(0, 16);
  }
}

export const draftInboxReply = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId?: string } | undefined) => ({
    conversationId: String(input?.conversationId || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return { ok: false as const, error: "missing" as const };
    const snapshot = await fetchAiFeatureFlags({ distinctId: context.userId });
    if (!(snapshot.reached === true && snapshot.flags[AI_FLAGS.replyDrafts] === true)) {
      return { ok: false as const, error: "off" as const };
    }
    const sql = await getSql();
    const access = await requireConversationWrite(sql, data.conversationId, context.userId);
    if (access.role === "parent") return { ok: false as const, error: "off" as const };
    const messages = await sql<{ body: string }>`
      select body from messages
      where conversation_id = ${access.conversation.id} and sender = 'parent'
      order by created_at desc
      limit 1
    `.catch(() => [] as Array<{ body: string }>);
    const parentMessage = scrubText(messages[0]?.body || "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!parentMessage) return { ok: false as const, error: "empty" as const };
    const rows = await sql<{
      name: string;
      city: string;
      hours: string | null;
      age_min_months: number | null;
      age_max_months: number | null;
      spots_infant: number | null;
      spots_toddler: number | null;
      spots_preschool: number | null;
    }>`
      select name, city, hours, age_min_months, age_max_months, spots_infant, spots_toddler, spots_preschool
      from daycares
      where id = ${access.conversation.daycare_id}
      limit 1
    `;
    const daycare = rows[0];
    if (!daycare) return { ok: false as const, error: "missing" as const };
    const facts: ReplyDraftFacts = {
      centre: String(daycare.name || "").replace(/\s+/g, " ").trim().slice(0, 80) || "A centre",
      city: String(daycare.city || "").replace(/\s+/g, " ").trim().slice(0, 60),
      hours: String(daycare.hours || "").replace(/\s+/g, " ").trim().slice(0, 80),
      infant: Number(daycare.spots_infant) || 0,
      toddler: Number(daycare.spots_toddler) || 0,
      preschool: Number(daycare.spots_preschool) || 0,
      ageMin: Number(daycare.age_min_months) || 0,
      ageMax: Number(daycare.age_max_months) || 0,
      parentMessage,
    };
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "ai-reply-drafts",
      system: REPLY_DRAFT_SYSTEM,
      user: replyDraftModelUser(facts),
      schema: replyDraftSchema,
      userId: context.userId,
      ipHash: await ipHashFor(context.userId),
      maxTokens: 180,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("ai-reply-drafts", key, body),
      },
    });
    const grounded = groundReplyDraft(result.ok ? result.data : null, facts);
    if (!grounded.body) return { ok: false as const, error: "fallback" as const };
    return { ok: true as const, body: grounded.body };
  });
