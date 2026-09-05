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
  videoEnabled,
  videoEnvPresence,
  videoJoinGate,
  videoMinutesStatus,
  videoRoomName,
  type VideoJoinGateReason,
  type VideoSourceKind,
} from "@/lib/video";

export type VideoJoinStatus = {
  roomId: string;
  roomName: string;
  kind: VideoSourceKind;
  featureOn: boolean;
  credentialsPresent: boolean;
  stripeLive: boolean;
  desk: "parent" | "provider" | "admin" | null;
  allowed: boolean;
  gateOk: boolean;
  reason: VideoJoinGateReason | null;
  error: string;
  sdkWired: false;
  recording: false;
  minutesEnforced: false;
  minutesMessage: string;
  noRecordingMessage: string;
};

export type VideoJoinResult =
  | {
      ok: true;
      roomName: string;
      roomSid: string;
      identity: string;
      ttlSeconds: number;
      expiresAt: number;
      tokenMinted: true;
      sdkWired: false;
      recording: false;
      minutesEnforced: false;
      minutesMessage: string;
      scaffold: string;
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
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from provider_daycares
    where user_id = ${userId} and daycare_id = ${daycareId}
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

async function resolveDesk(
  userId: string,
  kind: VideoSourceKind,
  sourceId: string,
  profileRole: string,
): Promise<{ allowed: boolean; desk: "parent" | "provider" | "admin" | null }> {
  const role = String(profileRole || "")
    .trim()
    .toLowerCase();
  if (role === "admin") return { allowed: true, desk: "admin" };
  if (kind === "admin") return { allowed: false, desk: null };

  const sql = await getSql();
  if (kind === "thread") {
    const conv = await sql<{ user_id: string; daycare_id: string }>`
      select user_id, daycare_id from conversations where id = ${sourceId} limit 1
    `.catch(() => []);
    if (conv[0]) {
      if (conv[0].user_id === userId) return { allowed: true, desk: "parent" };
      if (await ownsDaycare(userId, conv[0].daycare_id)) return { allowed: true, desk: "provider" };
      return { allowed: false, desk: null };
    }
    const booking = await sql<{ user_id: string; daycare_id: string }>`
      select user_id, daycare_id from bookings where id = ${sourceId} limit 1
    `.catch(() => []);
    if (booking[0]) {
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

async function buildStatus(userId: string, roomId: string): Promise<VideoJoinStatus> {
  const parsed = parseVideoRoomParam(roomId);
  const roomName = videoRoomName(parsed.kind, parsed.sourceId);
  const profile = await loadProfile(userId);
  const { allowed, desk } = await resolveDesk(userId, parsed.kind, parsed.sourceId, profile.role || "parent");
  const stripeLive = stripeChargesLive();
  const featureOn = videoEnabled();
  const credentialsPresent = videoCredentialsPresent();
  const gate = videoJoinGate({
    featureOn,
    credentialsPresent,
    stripeLive,
    actor: {
      role: desk || profile.role,
      plusPlan: profile.plus_plan,
      plusStatus: profile.plus_status,
    },
  });
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
    sdkWired: false,
    recording: false,
    minutesEnforced: false,
    minutesMessage: VIDEO_MINUTES_NOT_ENFORCED_MESSAGE,
    noRecordingMessage: VIDEO_NO_RECORDING_MESSAGE,
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

    void videoMinutesStatus(0);
    return {
      ok: true,
      roomName: room.roomName,
      roomSid: room.roomSid,
      identity: token.identity,
      ttlSeconds: token.ttlSeconds,
      expiresAt: token.expiresAt,
      tokenMinted: true,
      sdkWired: VIDEO_SDK_WIRED,
      recording: false,
      minutesEnforced: false,
      minutesMessage: VIDEO_MINUTES_NOT_ENFORCED_MESSAGE,
      scaffold: VIDEO_SDK_SCAFFOLD_MESSAGE,
    };
  });
