import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useState } from "react";
import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockMessagesButton, SafetyReportButton } from "@/components/safety-actions";
import { shellBlocksCallMedia } from "@/lib/call-match";
import { useCopy } from "@/lib/use-copy";

/**
 * True until the browser proves it can use the camera and microphone.
 * Android store apps built without CAMERA / RECORD_AUDIO stay true, so no
 * dead call button is shown there. Starts true so the first paint never
 * flashes a button that is then removed.
 */
export function useCallMediaBlocked(): boolean {
  const [blocked, setBlocked] = useState(true);
  useLayoutEffect(() => {
    setBlocked(shellBlocksCallMedia(typeof navigator === "undefined" ? "" : navigator.userAgent));
  }, []);
  return blocked;
}

/**
 * Phone + video actions for an inbox thread. Shared by the parent thread
 * (routes/inbox.$id) and the daycare desk inbox (centre-inbox) so both desks
 * render the identical control: same order, icon size, 44px tap target, labels.
 * Hidden unless the pair is matched (accepted tour, request, or enrolment).
 */
export function ThreadCallActions({
  conversationId,
  voiceReady,
  videoReady,
  matched = true,
}: {
  conversationId: string | null | undefined;
  voiceReady: boolean;
  videoReady: boolean;
  matched?: boolean;
}) {
  const { t } = useCopy();
  const mediaBlocked = useCallMediaBlocked();
  if (!conversationId || !matched || mediaBlocked) return null;
  return (
    <>
      {voiceReady ? (
        <Button variant="ghost" size="icon" className="size-11" asChild>
          <Link to="/call/$conversationId" params={{ conversationId }} reloadDocument aria-label={t("voiceStart")} title={t("voiceStart")} data-ke="inbox-voice-call">
            <Phone className="size-5" aria-hidden />
          </Link>
        </Button>
      ) : null}
      {videoReady ? (
        <Button variant="ghost" size="icon" className="size-11" asChild>
          <Link to="/video/$roomId" params={{ roomId: conversationId }} reloadDocument aria-label={t("videoCall")} title={t("videoCall")} data-ke="inbox-video-call">
            <Video className="size-5" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </>
  );
}

/**
 * Thread header controls, identical on the parent thread and the daycare /
 * staff desk: Call, Video (matched pairs only), Report, Block.
 */
export function ThreadHeaderActions({
  conversationId,
  voiceReady,
  videoReady,
  matched,
  blockSide,
}: {
  conversationId: string | null | undefined;
  voiceReady: boolean;
  videoReady: boolean;
  matched: boolean;
  blockSide: "daycare" | "family";
}) {
  if (!conversationId) return null;
  return (
    <div className="flex shrink-0 items-center" data-ke="thread-header-actions">
      <ThreadCallActions conversationId={conversationId} voiceReady={voiceReady} videoReady={videoReady} matched={matched} />
      <SafetyReportButton target="thread" conversationId={conversationId} variant="icon" />
      <BlockMessagesButton conversationId={conversationId} side={blockSide} variant="icon" />
    </div>
  );
}

/**
 * Friendly line when calls are on but this pair is not matched yet.
 * No internal wording, no flag names.
 */
export function ThreadCallLockedNote({
  show,
  viewer,
}: {
  show: boolean;
  viewer: "parent" | "centre";
}) {
  const { t } = useCopy();
  const mediaBlocked = useCallMediaBlocked();
  if (!show || mediaBlocked) return null;
  return (
    <p className="px-4 py-2 text-center text-xs text-muted" data-ke="thread-call-locked">
      {viewer === "centre" ? t("callsLockedCentre") : t("callsLockedParent")}
    </p>
  );
}
