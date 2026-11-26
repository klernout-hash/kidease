/**
 * "Video call started - Join" note in the thread. One per call: a second
 * join within VIDEO_ANNOUNCE_WINDOW_MINUTES does not post again. Also marks
 * this person's own ringing rows for the thread as answered.
 */

import { getSql } from "@/lib/db";
import { VIDEO_CALL_MESSAGE_BODY, VIDEO_CALL_MESSAGE_KIND } from "@/lib/video-call-note";

export const VIDEO_ANNOUNCE_WINDOW_MINUTES = 15;

function nid(): string {
  return `msg_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function announceVideoCall(input: {
  conversationId: string;
  userId: string;
  desk: "parent" | "provider" | "admin" | null;
}): Promise<{ posted: boolean }> {
  const conversationId = String(input.conversationId || "").trim();
  if (!conversationId) return { posted: false };
  const sql = await getSql();
  await sql`
    update call_rings set status = 'answered', ended_at = now()
    where conversation_id = ${conversationId} and callee_user_id = ${input.userId} and status = 'ringing'
  `.catch(() => null);
  const recent = await sql<{ id: string }>`
    select id from messages
    where conversation_id = ${conversationId} and kind = ${VIDEO_CALL_MESSAGE_KIND}
      and created_at > now() - make_interval(mins => ${VIDEO_ANNOUNCE_WINDOW_MINUTES})
    limit 1
  `.catch(() => [] as { id: string }[]);
  if (recent.length) return { posted: false };
  await sql`
    insert into messages (id, conversation_id, sender, body, kind)
    values (${nid()}, ${conversationId}, ${"system"}, ${VIDEO_CALL_MESSAGE_BODY}, ${VIDEO_CALL_MESSAGE_KIND})
  `;
  await sql`update conversations set last_at = now() where id = ${conversationId}`.catch(() => null);
  return { posted: true };
}
