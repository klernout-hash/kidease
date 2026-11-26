import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { useViewAs } from "@/components/view-as-banner";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useCallMediaBlocked } from "@/components/thread-call-actions";
import { cancelCallRing, getIncomingVideoRing, type IncomingVideoRing } from "@/lib/server/call-ring-fns";

/** Poll while the tab is visible. Rings last 45 s, so 15 s catches each one. */
export const INCOMING_VIDEO_POLL_MS = 15_000;

/**
 * In-app "Incoming video call" alert for the other side of a matched thread.
 * Works without FEATURE_CALL_PUSH: it reads the ring row the caller's video
 * room writes. Stops polling when video is not live. Quiet on /video pages,
 * in View As, and in Android store apps that cannot use the camera yet.
 */
export function IncomingVideoAlert() {
  const { t } = useCopy();
  const viewing = useViewAs();
  const user = useCurrentUser();
  const userId = user?.id || "";
  const path = useLocation({ select: (l) => l.pathname });
  const onVideoPage = /^\/video\//.test(path);
  const blocked = useCallMediaBlocked();
  const [ring, setRing] = useState<IncomingVideoRing | null>(null);
  const dismissed = useRef(new Set<string>());

  useEffect(() => {
    if (!userId || viewing || onVideoPage || blocked) {
      setRing(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        timer = setTimeout(() => void tick(), INCOMING_VIDEO_POLL_MS);
        return;
      }
      const res = await getIncomingVideoRing().catch(() => null);
      if (stopped) return;
      if (res && !res.enabled) {
        setRing(null);
        return; // video not live: stop polling
      }
      const next = res?.ring && !dismissed.current.has(res.ring.ringId) ? res.ring : null;
      setRing(next);
      timer = setTimeout(() => void tick(), INCOMING_VIDEO_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, viewing, onVideoPage, blocked]);

  if (!ring) return null;

  const decline = () => {
    dismissed.current.add(ring.ringId);
    setRing(null);
    void cancelCallRing({ data: { ringId: ring.ringId, reason: "declined" } }).catch(() => null);
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      data-ke="incoming-video"
      className="fixed inset-x-3 top-3 z-[1000] mx-auto max-w-md rounded-xl border border-border bg-surface p-4 text-fg shadow-card"
    >
      <p className="font-semibold">{t("videoCallIncoming")}</p>
      <p className="text-sm text-muted">{ring.callerName}</p>
      <div className="mt-3 flex gap-2">
        <Button asChild>
          <Link
            to="/video/$roomId"
            params={{ roomId: ring.conversationId }}
            onClick={() => {
              dismissed.current.add(ring.ringId);
              setRing(null);
            }}
          >
            {t("videoCallJoinShort")}
          </Link>
        </Button>
        <Button variant="outline" onClick={decline}>
          {t("videoCallDecline")}
        </Button>
      </div>
    </div>
  );
}
