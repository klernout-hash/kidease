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
  role: "parent" | "provider" | "staff";
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
  const actor = members.find((row) => row.user_id === input.actorId);
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
