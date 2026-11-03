import { Link } from "@tanstack/react-router";
import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";

/**
 * Phone + video actions for an inbox thread header. Shared by the parent thread
 * (routes/inbox.$id) and the daycare desk inbox (centre-inbox) so both desks
 * render the identical control: same order, icon size, 44px tap target, labels.
 */
export function ThreadCallActions({
  conversationId,
  voiceReady,
  videoReady,
}: {
  conversationId: string | null | undefined;
  voiceReady: boolean;
  videoReady: boolean;
}) {
  const { t } = useCopy();
  if (!conversationId) return null;
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
