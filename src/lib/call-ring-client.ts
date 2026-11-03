/**
 * Client side of the background ring (FEATURE_CALL_PUSH, off by default).
 * Starting a call asks the server to ring the other side's devices; the ring is
 * cancelled on answer, hang-up, decline, or after the server timeout (25 s).
 * With the flag off the server returns early, so this is a no-op.
 */
import { cancelCallRing, startCallRing } from "@/lib/server/call-ring-fns";

export type RingEnd = "answered" | "declined" | "timeout" | "hangup";

export function createCallRinger(conversationId: string, media: "voice" | "video") {
  let ring: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;
  let ended = false;
  const end = (reason: RingEnd) => {
    ended = true;
    const r = ring;
    if (!r) return;
    ring = null;
    clearTimeout(r.timer);
    void cancelCallRing({ data: { ringId: r.id, reason } }).catch(() => null);
  };
  const start = async () => {
    if (!conversationId || ring) return;
    ended = false;
    try {
      const res = (await startCallRing({ data: { conversationId, media } })) as { ringId?: string; timeoutSeconds?: number } | null;
      if (!res?.ringId) return;
      const timer = setTimeout(() => end("timeout"), (res.timeoutSeconds ?? 25) * 1000);
      ring = { id: res.ringId, timer };
      if (ended) end("hangup");
    } catch {
      /* best-effort: the in-app call still works without a background ring */
    }
  };
  return { start, end };
}
