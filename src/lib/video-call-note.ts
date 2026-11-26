/** Stored note for a started video call. The thread shows it in the reader's language. */
export const VIDEO_CALL_MESSAGE_KIND = "video_call";
export const VIDEO_CALL_MESSAGE_BODY = "Video call started - Join";

/** Join target for a thread's video call note. */
export function videoCallJoinPath(conversationId: string): string {
  return `/video/${encodeURIComponent(String(conversationId || "").trim())}`;
}
