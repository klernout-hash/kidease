import { useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { useViewAs } from "@/components/view-as-banner";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { mintInboxVoiceToken } from "@/lib/server/voice-call";
import { primeCallMedia } from "@/lib/call-permissions";
import { voiceErrorPlan, voiceTokenRefreshPlan } from "@/lib/voice-device";

/**
 * Registers the signed-in user's Twilio Device on every page so the other
 * side of a thread rings in the app (parent desk, daycare desk, iOS/Android
 * WebView in foreground). In-app only: no phone numbers anywhere.
 * The /call page keeps its own Device, so we stay quiet there.
 */
export function IncomingCallListener() {
  const { t } = useCopy();
  const viewing = useViewAs();
  const user = useCurrentUser();
  const userId = user?.id || "";
  const path = useLocation({ select: (l) => l.pathname });
  const onCallPage = /\/call\//.test(path);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const [phase, setPhase] = useState<"idle" | "incoming" | "connected">("idle");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!userId || viewing || onCallPage) return;
    let cancelled = false;
    const reset = () => {
      callRef.current = null;
      setPhase("idle");
      setMuted(false);
    };
    void (async () => {
      try {
        const minted = await mintInboxVoiceToken();
        if (!minted.ok || cancelled) return;
        const sdk = await import("@twilio/voice-sdk");
        const device = new sdk.Device(minted.token, { closeProtection: true });
        if (cancelled) return device.destroy();
        device.on("incoming", (call: Call) => {
          callRef.current = call;
          setPhase("incoming");
          call.on("disconnect", reset);
          call.on("cancel", reset);
          call.on("reject", reset);
        });
        const refresh = async () => {
          const next = await mintInboxVoiceToken().catch(() => null);
          const plan = voiceTokenRefreshPlan({
            registered: device.state === "registered",
            token: next?.ok ? next.token : null,
          });
          if (plan === "skip") return;
          if (plan === "register") {
            await device.register().catch(() => undefined);
            if (device.state === "registered" && next?.ok) device.updateToken(next.token);
            return;
          }
          if (next?.ok) device.updateToken(next.token);
        };
        device.on("tokenWillExpire", () => {
          void refresh();
        });
        device.on("error", (error: { code?: number }) => {
          const plan = voiceErrorPlan(Number(error?.code));
          if (plan === "register" || plan === "refresh") {
            if (plan === "register") void device.register().catch(() => undefined);
            else void refresh();
          }
        });
        await device.register();
        deviceRef.current = device;
      } catch {
        /* calling unavailable; stay silent */
      }
    })();
    return () => {
      cancelled = true;
      if (!callRef.current) {
        deviceRef.current?.destroy();
        deviceRef.current = null;
      }
    };
  }, [userId, viewing, onCallPage]);

  if (phase === "idle") return null;
  const call = callRef.current;
  const thread = call?.customParameters?.get("conversationId") || "";

  async function answer() {
    if (!callRef.current) return;
    const media = await primeCallMedia("audio");
    if (media === "denied") {
      callRef.current.reject();
      return;
    }
    callRef.current.accept();
    setPhase("connected");
  }

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      data-ke="incoming-call"
      className="fixed inset-x-3 top-3 z-[1000] mx-auto max-w-md rounded-xl border border-border bg-surface p-4 text-fg shadow-card"
    >
      <p className="font-semibold">{phase === "incoming" ? t("voiceIncoming") : t("voiceConnected")}</p>
      {thread ? <p className="text-xs text-muted">{t("mediaPermissionNote")}</p> : null}
      <div className="mt-3 flex gap-2">
        {phase === "incoming" ? (
          <>
            <Button onClick={() => void answer()}>{t("voiceAnswer")}</Button>
            <Button variant="outline" onClick={() => callRef.current?.reject()}>
              {t("voiceHangUp")}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                const next = !muted;
                callRef.current?.mute(next);
                setMuted(next);
              }}
            >
              {muted ? t("voiceUnmute") : t("voiceMute")}
            </Button>
            <Button variant="destructive" onClick={() => callRef.current?.disconnect()}>
              {t("voiceHangUp")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
