/**
 * Server functions for background call ring. FEATURE_CALL_PUSH gates all of them.
 * Only thread members can ring each other. Payloads never include phone numbers.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  CALL_RING_TIMEOUT_SECONDS,
  callPushEnabled,
  defaultTransport,
  fanoutCallMessage,
  type CallMedia,
  type CallPushProvider,
  type CallRingMessage,
  type CallTokenTarget,
} from "./call-ring";

const OFF = { ok: false as const, error: "Background ring is off." };

function newId(): string {
  return `ring_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function threadParties(conversationId: string) {
  const sql = await getSql();
  const rows = await sql<{ user_id: string; daycare_id: string; daycare_name: string; parent_name: string | null }>`
    select c.user_id, c.daycare_id, d.name as daycare_name, u.name as parent_name
    from conversations c join daycares d on d.id = c.daycare_id left join "user" u on u.id = c.user_id
    where c.id = ${conversationId} limit 1
  `.catch(() => []);
  return { sql, row: rows[0] };
}

async function calleeIds(sql: Awaited<ReturnType<typeof getSql>>, callerId: string, row: { user_id: string; daycare_id: string }) {
  if (row.user_id !== callerId) return [row.user_id];
  const staff = await sql<{ user_id: string }>`
    select user_id from provider_daycares where daycare_id = ${row.daycare_id}
    union select user_id from centre_members where daycare_id = ${row.daycare_id} and status = 'active'
  `.catch(() => []);
  return [...new Set(staff.map((s) => s.user_id))];
}

async function callTargets(sql: Awaited<ReturnType<typeof getSql>>, userIds: string[]): Promise<CallTokenTarget[]> {
  if (!userIds.length) return [];
  const rows = await sql<{ id: string; token: string; provider: CallPushProvider }>`
    select id, token, provider from push_device_tokens
    where user_id = any(${userIds}) and kind = 'call' and provider in ('apns_voip', 'fcm', 'hms', 'adm')
  `.catch(() => []);
  return rows;
}

async function webPush(userIds: string[], msg: CallRingMessage) {
  const { sendWebPushToUser } = await import("./web-push-send");
  const title = msg.type === "call" ? `${msg.callerName} is calling` : "Call ended";
  const body = msg.type === "call" ? (msg.media === "video" ? "KidEase video call" : "KidEase call") : "";
  for (const userId of userIds) {
    await sendWebPushToUser({ userId, title, body: body || title, url: `/inbox?thread=${encodeURIComponent(msg.conversationId)}&call=${msg.media}`, call: { type: msg.type, ringId: msg.ringId } }).catch(() => null);
  }
}

/** True only when FEATURE_CALL_PUSH is on. No secrets. The flag defaults off. */
export const getCallPushStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: callPushEnabled() }));

/** Register a VoIP / call-capable device token for the signed-in user. */
export const registerCallDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: { token: string; provider: string; platform: string }) => ({
    token: String(i?.token || "").trim(),
    provider: String(i?.provider || "") as CallPushProvider,
    platform: String(i?.platform || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!callPushEnabled()) return OFF;
    if (!/^[\x21-\x7E]{16,4096}$/.test(data.token)) return { ok: false as const, error: "Bad token." };
    if (!["apns_voip", "fcm", "hms", "adm"].includes(data.provider)) return { ok: false as const, error: "Bad provider." };
    if (!["ios", "android", "huawei", "amazon"].includes(data.platform)) return { ok: false as const, error: "Bad platform." };
    const sql = await getSql();
    await sql`
      insert into push_device_tokens (id, user_id, token, platform, provider, kind)
      values (${newId()}, ${context.userId}, ${data.token}, ${data.platform}, ${data.provider}, 'call')
      on conflict (token) do update set user_id = excluded.user_id, provider = excluded.provider, kind = 'call', last_seen_at = now()
    `;
    return { ok: true as const };
  });

/** Caller starts ringing the other side of the thread. Auto-expires after 25 s. */
export const startCallRing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: { conversationId: string; media?: string }) => ({
    conversationId: String(i?.conversationId || "").trim(),
    media: (i?.media === "video" ? "video" : "voice") as CallMedia,
  }))
  .handler(async ({ context, data }) => {
    if (!callPushEnabled()) return OFF;
    const { sql, row } = await threadParties(data.conversationId);
    if (!row) return { ok: false as const, error: "This call was not found." };
    const isParent = row.user_id === context.userId;
    if (!isParent) {
      const { hasCentreDeskAccess } = await import("./centre-access");
      if (!(await hasCentreDeskAccess(sql, context.userId, row.daycare_id))) return { ok: false as const, error: "This call was not found." };
    }
    const callees = await calleeIds(sql, context.userId, row);
    const ringId = newId();
    const callerName = isParent ? (row.parent_name || "Parent") : row.daycare_name || "Daycare";
    for (const callee of callees) {
      await sql`
        insert into call_rings (id, conversation_id, caller_user_id, callee_user_id, media, expires_at)
        values (${ringId + "_" + callee.slice(0, 12)}, ${data.conversationId}, ${context.userId}, ${callee}, ${data.media}, now() + make_interval(secs => ${CALL_RING_TIMEOUT_SECONDS}))
      `.catch(() => null);
    }
    const msg: CallRingMessage = { type: "call", ringId, conversationId: data.conversationId, media: data.media, callerName };
    const fan = await fanoutCallMessage(msg, await callTargets(sql, callees), process.env, defaultTransport());
    await webPush(callees, msg);
    return { ok: true as const, ringId, timeoutSeconds: CALL_RING_TIMEOUT_SECONDS, sent: fan.sent };
  });

/** Stop ringing on every device: answered, declined, caller hung up, or timed out. */
export const cancelCallRing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: { ringId: string; reason?: string }) => ({
    ringId: String(i?.ringId || "").trim(),
    reason: (["answered", "declined", "timeout", "hangup"].includes(String(i?.reason)) ? i.reason : "hangup") as CallRingMessage["reason"],
  }))
  .handler(async ({ context, data }) => {
    if (!callPushEnabled()) return OFF;
    const sql = await getSql();
    const rows = await sql<{ conversation_id: string; callee_user_id: string; caller_user_id: string; media: CallMedia }>`
      update call_rings set status = ${data.reason}, ended_at = now()
      where id like ${data.ringId + "_%"} and status = 'ringing'
        and (caller_user_id = ${context.userId} or callee_user_id = ${context.userId})
      returning conversation_id, callee_user_id, caller_user_id, media
    `.catch(() => []);
    if (!rows.length) return { ok: true as const, cancelled: 0 };
    const callees = rows.map((r) => r.callee_user_id);
    const msg: CallRingMessage = { type: "call-cancel", ringId: data.ringId, conversationId: rows[0].conversation_id, media: rows[0].media, callerName: "", reason: data.reason };
    await fanoutCallMessage(msg, await callTargets(sql, callees), process.env, defaultTransport());
    await webPush(callees, msg);
    return { ok: true as const, cancelled: rows.length };
  });
