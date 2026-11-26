/**
 * Client-safe createServerFn for Parent Plus–gated video tours.
 * Do not live in a `*.server.*` file. Token/room mint is dynamically imported
 * so the browser bundle never pulls node:crypto or Twilio secrets helpers.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { stripeChargesLive } from "@/lib/stripe-live";
import {
  parseVideoRoomParam,
  plusGateCopy,
  VIDEO_MINUTES_NOT_ENFORCED_MESSAGE,
  VIDEO_NO_RECORDING_MESSAGE,
  VIDEO_SDK_SCAFFOLD_MESSAGE,
  VIDEO_SDK_WIRED,
  VIDEO_TOKEN_TTL_SECONDS,
  videoCredentialsPresent,
  videoJoinGate,
  videoMinutesStatus,
  videoRoomName,
  type VideoJoinGateReason,
  type VideoSourceKind,
} from "@/lib/video";
import { videoArmed } from "@/lib/channel-readiness";
import { subscriptionsEnabled } from "@/lib/features";

export type VideoJoinStatus = {
  roomId: string;
  roomName: string;
  kind: VideoSourceKind;
  featureOn: boolean;
  subscriptionsOn: boolean;
  credentialsPresent: boolean;
  stripeLive: boolean;
  desk: "parent" | "provider" | "admin" | null;
  allowed: boolean;
  gateOk: boolean;
  reason: VideoJoinGateReason | null;
  error: string;
  sdkWired: boolean;
  recording: false;
  minutesEnforced: false;
  minutesMessage: string;
  noRecordingMessage: string;
  /** Thread id for a parent ↔ centre room (ring + "Video call started" note). */
  conversationId: string | null;
};

export type VideoJoinResult =
  | {
      ok: true;
      roomName: string;
      roomSid: string;
      identity: string;
      ttlSeconds: number;
      expiresAt: number;
      token: string;
      tokenMinted: true;
      sdkWired: boolean;
      recording: false;
      minutesEnforced: false;
      minutesMessage: string;
      scaffold: string;
      conversationId: string | null;
    }
  | {
      ok: false;
      reason: VideoJoinGateReason | "not_found" | "room_failed" | "token_failed";
      error: string;
      paywall: boolean;
    };

type ActorRow = {
  role: string | null;
  plus_plan: string | null;
  plus_status: string | null;
};

async function loadProfile(userId: string): Promise<ActorRow> {
  const sql = await getSql();
  const rows = await sql<ActorRow>`
    select role, plus_plan, plus_status from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0] ?? { role: "parent", plus_plan: "free", plus_status: null };
}

async function ownsDaycare(userId: string, daycareId: string): Promise<boolean> {
  const { hasCentreDeskAccess } = await import("@/lib/server/centre-access");
  const sql = await getSql();
  return hasCentreDeskAccess(sql, userId, daycareId);
}

async function resolveDesk(
  userId: string,
  kind: VideoSourceKind,
  sourceId: string,
  profileRole: string,
  rawSourceId?: string,
): Promise<{ allowed: boolean; desk: "parent" | "provider" | "admin" | null }> {
  const role = String(profileRole || "")
    .trim()
    .toLowerCase();
  if (role === "admin") return { allowed: true, desk: "admin" };
  if (kind === "admin") return { allowed: false, desk: null };

  const sql = await getSql();
  if (kind === "thread") {
    // Conversation ids may contain ":" (e.g. qa-reviewer-thread:<hash>). The room name is
    // sanitized, but membership must be checked against the raw id.
    const rawId = String(rawSourceId || sourceId);
    const ids = rawId !== sourceId ? [rawId, sourceId] : [sourceId];
    for (const cid of ids) {
      const hit = await sql<{ user_id: string; daycare_id: string }>`
        select user_id, daycare_id from conversations where id = ${cid} limit 1
      `.catch(() => []);
      if (hit[0]) {
        const opened = await allowIfUnblocked(userId, hit[0].user_id, hit[0].daycare_id);
        if (!opened) return { allowed: false, desk: null };
        if (hit[0].user_id === userId) return { allowed: true, desk: "parent" };
        if (await ownsDaycare(userId, hit[0].daycare_id)) return { allowed: true, desk: "provider" };
        return { allowed: false, desk: null };
      }
    }
    const conv = await sql<{ user_id: string; daycare_id: string }>`
      select user_id, daycare_id from conversations where id = ${sourceId} limit 1
    `.catch(() => []);
    if (conv[0]) {
      const opened = await allowIfUnblocked(userId, conv[0].user_id, conv[0].daycare_id);
      if (!opened) return { allowed: false, desk: null };
      if (conv[0].user_id === userId) return { allowed: true, desk: "parent" };
      if (await ownsDaycare(userId, conv[0].daycare_id)) return { allowed: true, desk: "provider" };
      return { allowed: false, desk: null };
    }
    const booking = await sql<{ user_id: string; daycare_id: string }>`
      select user_id, daycare_id from bookings where id = ${sourceId} limit 1
    `.catch(() => []);
    if (booking[0]) {
      const opened = await allowIfUnblocked(userId, booking[0].user_id, booking[0].daycare_id);
      if (!opened) return { allowed: false, desk: null };
      if (booking[0].user_id === userId) return { allowed: true, desk: "parent" };
      if (await ownsDaycare(userId, booking[0].daycare_id)) return { allowed: true, desk: "provider" };
      return { allowed: false, desk: null };
    }
    const claim = await sql<{ user_id: string }>`
      select user_id from listing_claims where id = ${sourceId} limit 1
    `.catch(() => []);
    if (claim[0]?.user_id === userId) return { allowed: true, desk: "provider" };
    return { allowed: false, desk: null };
  }

  if (kind === "booking") {
    const booking = await sql<{ user_id: string; daycare_id: string }>`
      select user_id, daycare_id from bookings where id = ${sourceId} limit 1
    `.catch(() => []);
    if (!booking[0]) return { allowed: false, desk: null };
    const opened = await allowIfUnblocked(userId, booking[0].user_id, booking[0].daycare_id);
    if (!opened) return { allowed: false, desk: null };
    if (booking[0].user_id === userId) return { allowed: true, desk: "parent" };
    if (await ownsDaycare(userId, booking[0].daycare_id)) return { allowed: true, desk: "provider" };
    return { allowed: false, desk: null };
  }

  if (kind === "claim") {
    const claim = await sql<{ user_id: string }>`
      select user_id from listing_claims where id = ${sourceId} limit 1
    `.catch(() => []);
    if (claim[0]?.user_id === userId) return { allowed: true, desk: "provider" };
    return { allowed: false, desk: null };
  }

  return { allowed: false, desk: null };
}

async function allowIfUnblocked(userId: string, parentUserId: string, daycareId: string): Promise<boolean> {
  const { assertChatNotBlocked } = await import("@/lib/server/safety");
  const sql = await getSql();
  try {
    await assertChatNotBlocked(sql, { senderId: userId, parentUserId, daycareId });
    return true;
  } catch {
    return false;
  }
}

/**
 * The parent ↔ centre pair behind a thread or booking room. Claim and admin
 * rooms have no pair. Used for the matched-pairs rule and the thread note.
 */
async function videoPair(
  kind: VideoSourceKind,
  sourceId: string,
  rawId: string,
): Promise<{ parentUserId: string; daycareId: string; conversationId: string | null } | null> {
  const sql = await getSql();
  if (kind === "thread") {
    const ids = rawId && rawId !== sourceId ? [rawId, sourceId] : [sourceId];
    for (const cid of ids) {
      const hit = await sql<{ id: string; user_id: string; daycare_id: string }>`
        select id, user_id, daycare_id from conversations where id = ${cid} limit 1
      `.catch(() => []);
      if (hit[0]) return { parentUserId: hit[0].user_id, daycareId: hit[0].daycare_id, conversationId: hit[0].id };
    }
  }
  if (kind === "thread" || kind === "booking") {
    const booking = await sql<{ user_id: string; daycare_id: string; conversation_id: string | null }>`
      select user_id, daycare_id, conversation_id from bookings where id = ${sourceId} limit 1
    `.catch(() => []);
    if (booking[0]) {
      return { parentUserId: booking[0].user_id, daycareId: booking[0].daycare_id, conversationId: booking[0].conversation_id || null };
    }
  }
  return null;
}

function rawThreadId(roomId: string): string {
  let v = String(roomId || "").trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    /* keep raw */
  }
  return /^[a-zA-Z0-9_:.-]{1,120}$/.test(v) ? v : "";
}

async function buildStatus(userId: string, roomId: string): Promise<VideoJoinStatus> {
  const parsed = parseVideoRoomParam(roomId);
  const roomName = videoRoomName(parsed.kind, parsed.sourceId);
  const profile = await loadProfile(userId);
  const { allowed, desk } = await resolveDesk(userId, parsed.kind, parsed.sourceId, profile.role || "parent", rawThreadId(roomId));
  const stripeLive = stripeChargesLive();
  const subsOn = subscriptionsEnabled();
  const featureOn = videoArmed();
  const credentialsPresent = videoCredentialsPresent();
  const pair = allowed && desk !== "admin" ? await videoPair(parsed.kind, parsed.sourceId, rawThreadId(roomId)) : null;
  // Matched pairs only: an accepted request, tour, booking, or enrolment. Fails closed.
  let matched = true;
  if (allowed && desk !== "admin" && pair) {
    const { pairCallMatched } = await import("@/lib/server/call-match");
    matched = await pairCallMatched(await getSql(), pair).catch(() => false);
  }
  const baseGate = videoJoinGate({
    featureOn,
    credentialsPresent,
    stripeLive,
    subscriptionsOn: subsOn,
    actor: {
      role: desk || profile.role,
      plusPlan: profile.plus_plan,
      plusStatus: profile.plus_status,
    },
    sdkWired: VIDEO_SDK_WIRED,
    allowScaffoldMint: desk === "admin",
  });
  const gate: typeof baseGate = matched
    ? baseGate
    : { ok: false, reason: "not_matched", error: plusGateCopy("not_matched") };
  const reason = gate.ok ? null : gate.reason;
  return {
    roomId,
    roomName,
    kind: parsed.kind,
    featureOn,
    credentialsPresent,
    stripeLive,
    desk,
    allowed,
    gateOk: Boolean(allowed && gate.ok),
    reason,
    error: !allowed ? "This video room was not found." : gate.ok ? "" : gate.error,
    sdkWired: VIDEO_SDK_WIRED,
    subscriptionsOn: subsOn,
    recording: false,
    minutesEnforced: false,
    minutesMessage: VIDEO_MINUTES_NOT_ENFORCED_MESSAGE,
    noRecordingMessage: VIDEO_NO_RECORDING_MESSAGE,
    conversationId: pair?.conversationId ?? null,
  };
}

export const getVideoJoinStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((roomId: string) => String(roomId || "").trim())
  .handler(async ({ context, data }) => buildStatus(context.userId, data));

export const joinVideoRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { roomId: string }) => ({ roomId: String(input.roomId || "").trim() }))
  .handler(async ({ context, data }): Promise<VideoJoinResult> => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("video");
    const status = await buildStatus(context.userId, data.roomId);
    if (!status.allowed) {
      return { ok: false, reason: "not_found", error: "This video room was not found.", paywall: false };
    }
    if (!status.gateOk) {
      const reason = status.reason ?? "feature_off";
      return {
        ok: false,
        reason,
        error: status.error || plusGateCopy(reason),
        paywall: reason === "plus_required" || reason === "plus_required_billing_not_live",
      };
    }

    const { gateMediaSession } = await import("./outbound-gate");
    const media = await gateMediaSession("video");
    if (!media.ok) return { ok: false, reason: "feature_off", error: media.error, paywall: false };
    const { createVideoRoom, createVideoAccessToken } = await import("./video");
    const room = await createVideoRoom({ roomName: status.roomName });
    if (!room.ok) {
      return {
        ok: false,
        reason: room.skipped ? (status.featureOn ? "no_credentials" : "feature_off") : "room_failed",
        error: room.error,
        paywall: false,
      };
    }

    const identity = `${status.desk}:${context.userId}`.slice(0, 120);
    const token = createVideoAccessToken({
      identity,
      roomName: room.roomName,
      ttlSeconds: VIDEO_TOKEN_TTL_SECONDS,
    });
    if (!token.ok) {
      return {
        ok: false,
        reason: token.skipped ? (status.featureOn ? "no_credentials" : "feature_off") : "token_failed",
        error: token.error,
        paywall: false,
      };
    }

    // Reserve the estimate; /api/video/status settles it to real minutes.
    const { recordMediaReservation } = await import("./media-usage");
    await recordMediaReservation({
      kind: "video",
      twilioSid: room.roomSid,
      identity: token.identity,
      conversationId: status.conversationId,
      userId: context.userId,
      usageDay: media.day,
      reservedMinutes: media.units,
    });
    if (status.conversationId && status.desk !== "admin") {
      const { announceVideoCall } = await import("./video-announce");
      await announceVideoCall({ conversationId: status.conversationId, userId: context.userId, desk: status.desk }).catch(() => null);
    }

    void videoMinutesStatus(0);
    return {
      ok: true,
      roomName: room.roomName,
      roomSid: room.roomSid,
      identity: token.identity,
      ttlSeconds: token.ttlSeconds,
      expiresAt: token.expiresAt,
      token: token.token,
      tokenMinted: true,
      sdkWired: VIDEO_SDK_WIRED,
      recording: false,
      minutesEnforced: false,
      minutesMessage: VIDEO_MINUTES_NOT_ENFORCED_MESSAGE,
      scaffold: VIDEO_SDK_SCAFFOLD_MESSAGE,
      conversationId: status.conversationId,
    };
  });
