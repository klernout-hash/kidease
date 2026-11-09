import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { isVercelProduction } from "@/lib/channel-readiness";
import { canAssignThread, holdAttachment, planEngagementEvent, searchAllowed, staffSeesThread, type EngagementEventName } from "@/lib/engagement";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { nid } from "@/lib/utils";
import { getSql } from "@/lib/db";
import type { CentreMemberRole } from "@/lib/centre-roles";

function environment(): "production" | "preview" | "test" {
  if (isVercelProduction()) return "production";
  if (process.env.VITEST || process.env.NODE_ENV === "test") return "test";
  return "preview";
}

export async function recordEngagement(input: {
  event: EngagementEventName;
  actorId: string;
  centreId: string;
  threadId: string;
  role: "parent" | "guardian" | "owner" | "manager" | "staff";
  qa: boolean;
  responseSeconds?: number | null;
  tourOutcome?: string | null;
  day?: string;
}): Promise<{ ok: true; stored: boolean } | { ok: false }> {
  const plan = planEngagementEvent({ ...input, environment: environment() });
  if (!plan) return { ok: true, stored: false };
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      insert into engagement_events (
        id, dedupe_key, event_name, actor_hash, centre_hash, thread_hash, role, environment, response_seconds, tour_outcome
      ) values (
        ${nid("eng")}, ${plan.dedupeKey}, ${plan.event}, ${plan.actorHash}, ${plan.centreHash}, ${plan.threadHash},
        ${plan.role}, ${plan.environment}, ${plan.responseSeconds}, ${plan.tourOutcome}
      )
      on conflict (dedupe_key) do nothing
      returning id
    `;
    return { ok: true, stored: Boolean(rows[0]) };
  } catch {
    return { ok: false };
  }
}

export async function centreReplyRole(
  userId: string,
  daycareId: string,
): Promise<"owner" | "manager" | "staff" | null> {
  const sql = await getSql();
  const members = await sql<{ role: string }>`
    select role from centre_members
    where user_id = ${userId} and daycare_id = ${daycareId} and status = 'active'
    limit 1
  `.catch(() => [] as Array<{ role: string }>);
  const role = members[0]?.role;
  if (role === "owner" || role === "manager" || role === "staff") return role;
  const owners = await sql<{ user_id: string }>`
    select user_id from provider_daycares where user_id = ${userId} and daycare_id = ${daycareId} limit 1
  `.catch(() => [] as Array<{ user_id: string }>);
  return owners[0] ? "owner" : null;
}

export async function noteSentMessage(input: {
  messageId: string;
  sender: "parent" | "provider";
  actorId: string;
  centreId: string;
  threadId: string;
  conversationUserId: string;
  priorAt: string;
}): Promise<void> {
  const { persistedPushState, withinSevenDays } = await import("@/lib/engagement");
  const { unifiedAlertsEnabled } = await import("@/lib/features");
  const { evaluateFeatureFlag } = await import("@/lib/flags");
  const qa = await centreIsQa(input.centreId);
  const sql = await getSql();
  const state = persistedPushState({
    unifiedOn: unifiedAlertsEnabled(),
    liveOn: evaluateFeatureFlag("FEATURE_UNIFIED_ALERTS_LIVE"),
    pushArmed: false,
    actuallySent: false,
  });
  const recipients =
    input.sender === "parent"
      ? await sql<{ user_id: string }>`
          select user_id from centre_members
          where daycare_id = ${input.centreId} and status = 'active' and role in ('owner', 'manager', 'staff')
        `.catch(() => [] as Array<{ user_id: string }>)
      : [{ user_id: input.conversationUserId }];
  for (const recipient of recipients) {
    if (!recipient.user_id || recipient.user_id === input.actorId) continue;
    await sql`
      insert into message_push_state (message_id, recipient_user_id, state)
      values (${input.messageId}, ${recipient.user_id}, ${state})
      on conflict (message_id, recipient_user_id) do nothing
    `.catch(() => undefined);
  }
  if (input.sender === "provider") {
    const role = await centreReplyRole(input.actorId, input.centreId);
    if (!role) return;
    await recordEngagement({
      event: "provider_reply",
      actorId: input.actorId,
      centreId: input.centreId,
      threadId: input.threadId,
      role,
      qa,
    });
    return;
  }
  if (!withinSevenDays(input.priorAt, new Date().toISOString())) return;
  const priorReplies = await sql<{ n: number }>`
    select count(*)::int as n from messages
    where conversation_id = ${input.threadId} and sender = 'provider'
  `.catch(() => [] as Array<{ n: number }>);
  if (!priorReplies[0] || priorReplies[0].n < 1) return;
  await recordEngagement({
    event: "thread_return_7d",
    actorId: input.actorId,
    centreId: input.centreId,
    threadId: input.threadId,
    role: input.actorId === input.conversationUserId ? "parent" : "guardian",
    qa,
    day: new Date().toISOString().slice(0, 10),
  });
}

export async function centreIsQa(daycareId: string): Promise<boolean> {
  try {
    const sql = await getSql();
    const rows = await sql<{ name: string | null; slug: string | null; visibility: string | null; is_test: number | null }>`
      select name, slug, visibility, is_test from daycares where id = ${daycareId} limit 1
    `;
    const row = rows[0];
    if (!row) return false;
    return isAdminOnlyListing({ name: row.name, slug: row.slug, visibility: row.visibility, isTest: row.is_test });
  } catch {
    return false;
  }
}

export async function assignThread(input: {
  actorId: string;
  conversationId: string;
  assigneeId: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "denied" | "missing" }> {
  const sql = await getSql();
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from conversations where id = ${input.conversationId} limit 1
  `;
  const daycareId = rows[0]?.daycare_id;
  if (!daycareId) return { ok: false, reason: "missing" };
  const members = await sql<{ user_id: string; role: string; status: string }>`
    select user_id, role, status from centre_members
    where daycare_id = ${daycareId} and status = 'active'
  `.catch(() => [] as Array<{ user_id: string; role: string; status: string }>);
  let actor = members.find((row) => row.user_id === input.actorId);
  if (!actor) {
    const owners = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${input.actorId} and daycare_id = ${daycareId}
      limit 1
    `.catch(() => [] as Array<{ user_id: string }>);
    if (owners[0]) {
      actor = { user_id: input.actorId, role: "owner", status: "active" };
      members.push(actor);
    }
  }
  if (!canAssignThread((actor?.role as CentreMemberRole) || null, actor?.status === "active")) {
    return { ok: false, reason: "denied" };
  }
  if (input.assigneeId && !members.some((row) => row.user_id === input.assigneeId)) {
    return { ok: false, reason: "denied" };
  }
  await sql`
    update conversations set assigned_user_id = ${input.assigneeId}
    where id = ${input.conversationId}
  `;
  return { ok: true };
}

export function viewerMaySeeAssigned(input: {
  role: CentreMemberRole | null;
  active: boolean;
  assignedTo: string | null;
  staffId: string;
}): boolean {
  return staffSeesThread(input);
}

export async function searchMyMessages(input: {
  userId: string;
  conversationId: string;
  query: string;
}): Promise<{ ok: true; hits: { id: string }[] } | { ok: false; reason: "denied" }> {
  const needle = input.query.trim().slice(0, 80);
  if (needle.length < 2) return { ok: true, hits: [] };
  const sql = await getSql();
  const allowed = await sql<{ id: string }>`
    select c.id from conversations c
    where c.user_id = ${input.userId}
       or exists (
         select 1 from centre_members m
         where m.user_id = ${input.userId} and m.daycare_id = c.daycare_id and m.status = 'active'
       )
       or exists (
         select 1 from provider_daycares p
         where p.user_id = ${input.userId} and p.daycare_id = c.daycare_id
       )
  `;
  const ids = allowed.map((row) => row.id);
  if (!searchAllowed(input.conversationId, ids)) return { ok: false, reason: "denied" };
  const like = `%${needle.replace(/[%_]/g, "")}%`;
  const hits = await sql<{ id: string }>`
    select id from messages
    where conversation_id = ${input.conversationId}
      and body ilike ${like}
    order by created_at desc
    limit 20
  `;
  return { ok: true, hits: hits.map((row) => ({ id: row.id })) };
}

export function quarantineAttachment(input: { mime: string; bytes: number }) {
  const held = holdAttachment(input);
  if (!held.ok) return held;
  return { ...held, readable: false as const };
}

export const assignInboxThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId?: string; assigneeId?: string | null }) => ({
    conversationId: String(input?.conversationId || "").trim(),
    assigneeId: input?.assigneeId ? String(input.assigneeId) : null,
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return { ok: false as const, reason: "missing" as const };
    return assignThread({
      actorId: context.userId,
      conversationId: data.conversationId,
      assigneeId: data.assigneeId,
    });
  });

export async function searchVisibleThreads(input: { userId: string; query: string }): Promise<{ ok: true; ids: string[] }> {
  const needle = input.query.trim().replace(/\s+/g, " ").slice(0, 80);
  if (needle.length < 2) return { ok: true, ids: [] };
  const like = `%${needle.replace(/[%_]/g, "")}%`;
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select c.id
    from conversations c
    where (
      c.user_id = ${input.userId}
      or exists (
        select 1 from centre_members m
        where m.user_id = ${input.userId} and m.daycare_id = c.daycare_id and m.status = 'active'
      )
      or exists (
        select 1 from provider_daycares p
        where p.user_id = ${input.userId} and p.daycare_id = c.daycare_id
      )
    )
    and exists (
      select 1 from messages m
      where m.conversation_id = c.id
        and m.sender <> 'system'
        and coalesce(m.kind, 'chat') = 'chat'
        and m.body ilike ${like}
    )
    order by c.last_at desc
    limit 50
  `;
  return { ok: true, ids: rows.map((row) => row.id) };
}

export const searchInboxList = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { query?: string }) => ({
    query: String(input?.query || ""),
  }))
  .handler(async ({ context, data }) => searchVisibleThreads({ userId: context.userId, query: data.query }));

export const searchInboxText = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId?: string; query?: string }) => ({
    conversationId: String(input?.conversationId || "").trim(),
    query: String(input?.query || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return { ok: false as const, reason: "denied" as const };
    return searchMyMessages({ userId: context.userId, conversationId: data.conversationId, query: data.query });
  });
