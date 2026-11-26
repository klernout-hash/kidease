/**
 * Reserve and settle real call minutes for the daily media cap.
 * Every write is best-effort: a failed settle leaves the (larger) reservation
 * counted, so the cap errs toward blocking, never toward overspending.
 */

import { getSql } from "@/lib/db";
import {
  MEDIA_RESERVE_SQL,
  SETTLE_VIDEO_PARTICIPANT_SQL,
  SETTLE_VIDEO_ROOM_SQL,
  SETTLE_VOICE_CALL_SQL,
  billedMinutes,
  voiceCallMinutes,
} from "@/lib/media-minutes";

function newId(kind: string): string {
  return `ms_${kind}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function recordMediaReservation(input: {
  kind: "video" | "voice";
  twilioSid: string;
  identity?: string | null;
  conversationId?: string | null;
  userId?: string | null;
  usageDay: string;
  reservedMinutes: number;
  /** Stable id for retried webhooks (voice uses the CallSid). */
  id?: string;
}): Promise<void> {
  const sid = String(input.twilioSid || "").trim();
  if (!sid) return;
  const sql = await getSql();
  await sql
    .query(MEDIA_RESERVE_SQL, [
      input.id || newId(input.kind),
      input.kind,
      sid,
      input.identity ?? null,
      input.conversationId ?? null,
      input.userId ?? null,
      input.usageDay,
      Math.max(0, Math.floor(input.reservedMinutes) || 0),
    ])
    .catch((err) => console.error("[kidease-media] reserve failed", (err as Error)?.message));
}

/** True when a voice row already exists for this CallSid (retried connect webhook). */
export async function voiceReservationExists(callSid: string): Promise<boolean> {
  const sid = String(callSid || "").trim();
  if (!sid) return false;
  const sql = await getSql();
  const rows = await sql<{ one: number }>`
    select 1 as one from media_sessions where kind = 'voice' and twilio_sid = ${sid} limit 1
  `.catch(() => [] as { one: number }[]);
  return rows.length > 0;
}

export async function settleVideoParticipant(input: {
  roomSid: string;
  identity: string;
  participantSid: string;
  durationSeconds: unknown;
}): Promise<void> {
  if (!input.roomSid || !input.identity || !input.participantSid) return;
  const sql = await getSql();
  await sql
    .query(SETTLE_VIDEO_PARTICIPANT_SQL, [input.roomSid, input.identity, input.participantSid, billedMinutes(input.durationSeconds)])
    .catch((err) => console.error("[kidease-media] video settle failed", (err as Error)?.message));
}

export async function settleVideoRoom(input: { roomSid: string; durationSeconds: unknown }): Promise<void> {
  if (!input.roomSid) return;
  const sql = await getSql();
  await sql
    .query(SETTLE_VIDEO_ROOM_SQL, [input.roomSid, billedMinutes(input.durationSeconds)])
    .catch((err) => console.error("[kidease-media] room settle failed", (err as Error)?.message));
}

export async function settleVoiceCall(input: {
  callSid: string;
  dialStatus: string | null | undefined;
  dialDurationSeconds: unknown;
}): Promise<void> {
  if (!input.callSid) return;
  const sql = await getSql();
  await sql
    .query(SETTLE_VOICE_CALL_SQL, [input.callSid, voiceCallMinutes(input.dialStatus, input.dialDurationSeconds)])
    .catch((err) => console.error("[kidease-media] voice settle failed", (err as Error)?.message));
}
