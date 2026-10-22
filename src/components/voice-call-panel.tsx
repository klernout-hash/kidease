import { useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { useViewAs } from "@/components/view-as-banner";
import { mintThreadVoiceToken } from "@/lib/server/voice-call";

/**
 * Browser call through Twilio. The access token stays in memory.
 * The other person's phone number is never shown.
 */
export function VoiceCallPanel({ conversationId }: { conversationId: string }) {
  const { t } = useCopy();
  const viewing = useViewAs();
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const [phase, setPhase] = useState<"ready" | "ringing" | "incoming" | "connected" | "error">("ready");
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (viewing) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const minted = await mintThreadVoiceToken({ data: { conversationId } });
        if (!minted.ok) {
          if (!cancelled) {
            setPhase("error");
            setNote(minted.error);
            setBusy(false);
          }
          return;
        }
        const sdk = await import("@twilio/voice-sdk");
        const device = new sdk.Device(minted.token);
        if (cancelled) {
          device.destroy();
          return;
        }
        device.on("incoming", (call) => {
          callRef.current = call;
          setPhase("incoming");
          setNote(t("voiceIncoming"));
          call.on("disconnect", () => {
            callRef.current = null;
            setPhase("ready");
            setMuted(false);
          });
          call.on("cancel", () => {
            callRef.current = null;
            setPhase("ready");
          });
        });
        await device.register();
        deviceRef.current = device;
        if (!cancelled) setBusy(false);
      } catch {
        if (!cancelled) {
          setPhase("error");
          setNote(t("voiceFailed"));
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      callRef.current?.disconnect();
      callRef.current = null;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [conversationId, t, viewing]);

  function watch(call: Call) {
    callRef.current = call;
    call.on("accept", () => {
      setPhase("connected");
      setNote(t("voiceConnected"));
    });
    call.on("disconnect", () => {
      callRef.current = null;
      setPhase("ready");
      setMuted(false);
      setNote("");
    });
    call.on("cancel", () => {
      callRef.current = null;
      setPhase("ready");
      setNote(t("voiceFailed"));
    });
    call.on("reject", () => {
      callRef.current = null;
      setPhase("ready");
      setNote(t("voiceFailed"));
    });
  }

  async function start() {
    const device = deviceRef.current;
    if (!device) return;
    setNote(t("voiceWaiting"));
    setPhase("ringing");
    try {
      const call = await device.connect({ params: { conversationId } });
      watch(call);
    } catch {
      setPhase("error");
      setNote(t("voiceFailed"));
    }
  }

  function answer() {
    const call = callRef.current;
    if (!call) return;
    call.accept();
    setPhase("connected");
    setNote(t("voiceConnected"));
  }

  function hangUp() {
    callRef.current?.disconnect();
    callRef.current = null;
    setPhase("ready");
    setMuted(false);
    setNote("");
  }

  function toggleMute() {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }

  if (viewing) {
    return (
      <p className="mt-6 text-sm text-muted" role="status" data-ke="view-as-lock">
        {t("viewAsReadOnly")}
      </p>
    );
  }

  const live = phase === "connected";
  const incoming = phase === "incoming";

  return (
    <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
      <p className="text-sm text-muted" aria-live="polite">
        {busy ? t("loading") : note || t("voiceWaitingHint")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {incoming ? (
          <Button type="button" className="min-w-11" onClick={answer}>
            {t("voiceAnswer")}
          </Button>
        ) : live ? (
          <Button type="button" variant="danger" className="min-w-11" onClick={hangUp}>
            {t("voiceHangUp")}
          </Button>
        ) : (
          <Button type="button" className="min-w-11" disabled={busy || phase === "ringing"} onClick={() => void start()}>
            {phase === "ringing" ? t("loading") : t("voiceStart")}
          </Button>
        )}
        {live ? (
          <Button type="button" variant="secondary" className="min-w-11" onClick={toggleMute}>
            {muted ? t("voiceUnmute") : t("voiceMute")}
          </Button>
        ) : null}
        {live || incoming ? null : phase === "ringing" ? (
          <Button type="button" variant="secondary" className="min-w-11" onClick={hangUp}>
            {t("voiceHangUp")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
