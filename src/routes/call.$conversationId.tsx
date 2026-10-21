import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { VoiceCallPanel } from "@/components/voice-call-panel";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getVoiceCallStatus, type VoiceCallStatus } from "@/lib/server/voice-call";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";

export const Route = createFileRoute("/call/$conversationId")({
  head: () => ({
    meta: [
      { title: "Call · KidEase" },
      { name: "description", content: "Call a daycare or a parent through KidEase. Phone numbers stay hidden." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CallPage,
});

function CallPage() {
  const { conversationId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const nativeShell = useInNativeShell();
  const [status, setStatus] = useState<VoiceCallStatus | null>(null);
  const [failed, setFailed] = useState(false);

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
      <main className="mx-auto w-full max-w-lg px-4 py-8 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        <Link to="/inbox/$id" params={{ id: conversationId }} className="text-sm text-muted">
          ← {t("voiceBackInbox")}
        </Link>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("voiceCallKicker")}</p>
        <h1 className="mt-2 font-display text-3xl">{t("voiceCallTitle")}</h1>
        {lead ? <p className="mt-3 text-sm text-muted">{lead}</p> : null}
        {status?.peerLabel ? <p className="mt-2 text-sm font-medium">{status.peerLabel}</p> : null}

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

        {status && !status.allowed ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="text-sm text-muted">{t("voiceUnavailable")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox">{t("voiceBackInbox")}</Link>
            </Button>
          </div>
        ) : null}

        {status?.allowed && !status.credentialsPresent ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="text-sm text-muted">{t("voiceNoCredentials")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox/$id" params={{ id: conversationId }}>
                {t("voiceBackInbox")}
              </Link>
            </Button>
          </div>
        ) : null}

        {nativeShell ? (
          <p className="mt-6 text-sm text-muted" data-ke="native-voice-off">{t("comingSoon")}</p>
        ) : status?.allowed && status.credentialsPresent ? (
          <VoiceCallPanel conversationId={conversationId} />
        ) : null}
      </main>
    </Shell>
  );
}
