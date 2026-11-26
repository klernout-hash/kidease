import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { VoiceCallPanel } from "@/components/voice-call-panel";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getVoiceCallStatus, VOICE_OFF, type VoiceCallStatus } from "@/lib/server/voice-call";
import { useCopy } from "@/lib/use-copy";
import { CALL_NOT_MATCHED } from "@/lib/call-match";
import { useCallMediaBlocked } from "@/components/thread-call-actions";

export const Route = createFileRoute("/call/$conversationId")({
  head: () => ({
    meta: [
      { title: "Call · KidEase" },
      { name: "description", content: "An in-app call between a daycare and a parent in KidEase. No phone number is dialled." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CallPage,
});

function CallPage() {
  const { conversationId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const [status, setStatus] = useState<VoiceCallStatus | null>(null);
  const [failed, setFailed] = useState(false);
  // Android store apps without microphone permission (until the next build).
  const appBlocked = useCallMediaBlocked();

  useEffect(() => {
    if (!user) return;
    setFailed(false);
    void getVoiceCallStatus({ data: conversationId })
      .then((next) => {
        setStatus(next);
        setFailed(false);
      })
      .catch(() => {
        setStatus(null);
        setFailed(true);
      });
  }, [conversationId, user]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const lead =
    status?.desk === "provider"
      ? t("voiceCallLeadCentre")
      : status?.desk === "admin"
        ? t("voiceCallLeadAdmin")
        : status?.desk === "parent"
          ? t("voiceCallLeadParent")
          : "";

  return (
    <Shell>
      <main className="w-full px-4 py-8 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        <div className="ke-call-stage" data-ke="call-stage">
        <div className="min-w-0">
        <Link to="/inbox/$id" params={{ id: conversationId }} className="text-sm text-muted">
          ← {t("voiceBackInbox")}
        </Link>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("voiceCallKicker")}</p>
        <h1 className="mt-2 font-display text-3xl">{t("voiceCallTitle")}</h1>
        {lead ? <p className="mt-3 text-sm text-muted">{lead}</p> : null}
        {status?.peerLabel ? <p className="mt-2 text-sm font-medium">{status.peerLabel}</p> : null}
        <p className="mt-3 text-sm font-medium" data-ke="call-in-app-note">{t("callsInAppNote")}</p>
        <p className="mt-2 text-sm text-muted" data-ke="media-permission-note">{t("mediaPermissionNote")}</p>

        {!status && !failed ? <p className="mt-6 text-sm text-muted">{t("loading")}</p> : null}

        {failed ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="text-sm text-muted">{t("voiceFailed")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox/$id" params={{ id: conversationId }}>
                {t("voiceBackInbox")}
              </Link>
            </Button>
          </div>
        ) : null}

        {status && appBlocked ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="call-unavailable-app">
            <p className="font-medium">{t("callsUnavailableTitle")}</p>
            <p className="mt-2 text-sm text-muted">{t("callsUnavailableApp")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox/$id" params={{ id: conversationId }}>
                {t("voiceBackInbox")}
              </Link>
            </Button>
          </div>
        ) : null}

        {!appBlocked && status && !status.allowed && status.error === CALL_NOT_MATCHED ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="call-not-matched">
            <p className="text-sm text-muted">{status.desk === "provider" ? t("callsLockedCentre") : t("callsNotMatched")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox/$id" params={{ id: conversationId }}>
                {t("voiceBackInbox")}
              </Link>
            </Button>
          </div>
        ) : null}

        {!appBlocked && status && !status.allowed && status.error !== CALL_NOT_MATCHED && status.error !== VOICE_OFF ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="text-sm text-muted">{t("voiceUnavailable")}</p>
            <Button asChild className="mt-4">
              <Link to="/">{t("navHome")}</Link>
            </Button>
          </div>
        ) : null}

        {!appBlocked && status && (status.error === VOICE_OFF || (status.allowed && !status.credentialsPresent)) ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="call-unavailable">
            <p className="font-medium">{t("callsUnavailableTitle")}</p>
            <p className="mt-2 text-sm text-muted">{t("callsUnavailable")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox/$id" params={{ id: conversationId }}>
                {t("voiceBackInbox")}
              </Link>
            </Button>
          </div>
        ) : null}

        </div>
        <div className="min-w-0">
        {!appBlocked && status?.allowed && status.credentialsPresent ? (
          <VoiceCallPanel conversationId={conversationId} />
        ) : null}
        </div>
        </div>
      </main>
    </Shell>
  );
}
