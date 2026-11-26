/**
 * Server functions for call rings. A ring row is written for every matched
 * call so the other side gets an in-app "Incoming video call" alert; device
 * push (VoIP / FCM / web push) is still gated by FEATURE_CALL_PUSH.
 * Only matched thread members can ring each other. Payloads never include phone numbers.
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

/** Video gives the other side longer to notice the in-app alert. */
export const VIDEO_RING_TIMEOUT_SECONDS = 45;

function ringTimeoutSeconds(media: CallMedia): number {
  return media === "video" ? VIDEO_RING_TIMEOUT_SECONDS : CALL_RING_TIMEOUT_SECONDS;
}

/** A ring is only written while that call type is actually live. */
async function ringMediaLive(media: CallMedia): Promise<boolean> {
  if (media === "video") {
    const { videoArmed } = await import("@/lib/channel-readiness");
    const { videoCredentialsPresent } = await import("@/lib/video");
    return videoArmed() && videoCredentialsPresent();
  }
  const { voiceCallsEnabled } = await import("@/lib/features");
  return voiceCallsEnabled();
}

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
    if (!(await ringMediaLive(data.media))) return OFF;
    const { sql, row } = await threadParties(data.conversationId);
    if (!row) return { ok: false as const, error: "This call was not found." };
    const { assertChatNotBlocked } = await import("@/lib/server/safety");
    try {
      await assertChatNotBlocked(sql, { senderId: context.userId, parentUserId: row.user_id, daycareId: row.daycare_id });
    } catch {
      return { ok: false as const, error: "safety_blocked" };
    }
    const isParent = row.user_id === context.userId;
    if (!isParent) {
      const { hasCentreDeskAccess } = await import("./centre-access");
      if (!(await hasCentreDeskAccess(sql, context.userId, row.daycare_id))) return { ok: false as const, error: "This call was not found." };
    }
    const { pairCallMatched } = await import("./call-match");
    if (!(await pairCallMatched(sql, { parentUserId: row.user_id, daycareId: row.daycare_id, conversationId: data.conversationId }))) {
      return { ok: false as const, error: "call_not_matched" };
    }
    const callees = (await calleeIds(sql, context.userId, row)).filter((id) => id !== context.userId);
    const ringId = newId();
    const timeoutSeconds = ringTimeoutSeconds(data.media);
    const callerName = isParent ? (row.parent_name || "Parent") : row.daycare_name || "Daycare";
    for (const callee of callees) {
      await sql`
        insert into call_rings (id, conversation_id, caller_user_id, callee_user_id, media, expires_at)
        values (${ringId + "_" + callee.slice(0, 12)}, ${data.conversationId}, ${context.userId}, ${callee}, ${data.media}, now() + make_interval(secs => ${timeoutSeconds}))
      `.catch(() => null);
    }
    if (!callPushEnabled()) return { ok: true as const, ringId, timeoutSeconds, sent: 0 };
    const msg: CallRingMessage = { type: "call", ringId, conversationId: data.conversationId, media: data.media, callerName };
    const fan = await fanoutCallMessage(msg, await callTargets(sql, callees), process.env, defaultTransport());
    await webPush(callees, msg);
    return { ok: true as const, ringId, timeoutSeconds, sent: fan.sent };
  });

/** Stop ringing on every device: answered, declined, caller hung up, or timed out. */
export const cancelCallRing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: { ringId: string; reason?: string }) => ({
    ringId: String(i?.ringId || "").trim(),
    reason: (["answered", "declined", "timeout", "hangup"].includes(String(i?.reason)) ? i.reason : "hangup") as CallRingMessage["reason"],
  }))
  .handler(async ({ context, data }) => {
    if (!/^ring_[0-9a-f]{8,64}$/.test(data.ringId)) return { ok: true as const, cancelled: 0 };
    const sql = await getSql();
    const rows = await sql<{ conversation_id: string; callee_user_id: string; caller_user_id: string; media: CallMedia }>`
      update call_rings set status = ${data.reason}, ended_at = now()
      where id like ${data.ringId + "_%"} and status = 'ringing'
        and (caller_user_id = ${context.userId} or callee_user_id = ${context.userId})
      returning conversation_id, callee_user_id, caller_user_id, media
    `.catch(() => []);
    if (!rows.length) return { ok: true as const, cancelled: 0 };
    if (!callPushEnabled()) return { ok: true as const, cancelled: rows.length };
    const callees = rows.map((r) => r.callee_user_id);
    const msg: CallRingMessage = { type: "call-cancel", ringId: data.ringId, conversationId: rows[0].conversation_id, media: rows[0].media, callerName: "", reason: data.reason };
    await fanoutCallMessage(msg, await callTargets(sql, callees), process.env, defaultTransport());
    await webPush(callees, msg);
    return { ok: true as const, cancelled: rows.length };
  });

export type IncomingVideoRing = {
  ringId: string;
  conversationId: string;
  callerName: string;
};

/**
 * In-app alert for the other side of a video call. Returns the newest
 * unexpired ring for the signed-in person, or enabled:false when video is not
 * live (the client then stops polling).
 */
export const getIncomingVideoRing = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ enabled: boolean; ring: IncomingVideoRing | null }> => {
    if (!(await ringMediaLive("video"))) return { enabled: false, ring: null };
    const sql = await getSql();
    const rows = await sql<{ id: string; conversation_id: string; caller_user_id: string; user_id: string; daycare_name: string; parent_name: string | null }>`
      select r.id, r.conversation_id, r.caller_user_id, c.user_id, d.name as daycare_name, u.name as parent_name
      from call_rings r
      join conversations c on c.id = r.conversation_id
      join daycares d on d.id = c.daycare_id
      left join "user" u on u.id = c.user_id
      where r.callee_user_id = ${context.userId} and r.media = 'video' and r.status = 'ringing' and r.expires_at > now()
      order by r.created_at desc
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) return { enabled: true, ring: null };
    const ringId = /^ring_[0-9a-f]{32}/.exec(row.id)?.[0] || "";
    if (!ringId) return { enabled: true, ring: null };
    const callerName = row.caller_user_id === row.user_id ? row.parent_name || "Parent" : row.daycare_name || "Daycare";
    return { enabled: true, ring: { ringId, conversationId: row.conversation_id, callerName } };
  });
