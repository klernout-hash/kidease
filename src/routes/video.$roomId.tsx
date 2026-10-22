import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { useViewAs } from "@/components/view-as-banner";
import { useInNativeShell } from "@/lib/use-native-shell";
import { VideoRoomPanel } from "@/components/video-room-panel";
import { PayCtas } from "@/components/pay-chrome";
import {
  getVideoJoinStatus,
  joinVideoRoom,
  type VideoJoinResult,
  type VideoJoinStatus,
} from "@/lib/server/video-join";
import { primeCallMedia } from "@/lib/call-permissions";

export const Route = createFileRoute("/video/$roomId")({
  head: () => ({
    meta: [
      { title: "Video tour · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VideoRoomPage,
});

function VideoRoomPage() {
  const { roomId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const viewing = useViewAs();
  const nativeShell = useInNativeShell();
  const [status, setStatus] = useState<VideoJoinStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [joined, setJoined] = useState<Extract<VideoJoinResult, { ok: true }> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setJoined(null);
    setError("");
    setStatusFailed(false);
    void getVideoJoinStatus({ data: roomId })
      .then((next) => {
        setStatus(next);
        setStatusFailed(false);
      })
      .catch(() => {
        setStatus(null);
        setStatusFailed(true);
      });
  }, [user, roomId]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const paywall = status?.reason === "plus_required" || status?.reason === "plus_required_billing_not_live";
  const featureOff = status?.reason === "feature_off";
  const noCredentials = status?.reason === "no_credentials";
  const sdkOff = status?.reason === "sdk_not_wired";
  const blockedScaffold = Boolean(featureOff || noCredentials || sdkOff);
  const canMint = Boolean(status?.gateOk);

  async function onJoin() {
    if (viewing) {
      setError(t("viewAsReadOnly"));
      return;
    }
    setBusy(true);
    setError("");
    const media = await primeCallMedia("video");
    if (media === "denied") {
      setError(t("mediaPermissionDenied"));
      setBusy(false);
      return;
    }
    try {
      const result = await joinVideoRoom({ data: { roomId } });
      if (result.ok) {
        setJoined(result);
      } else {
        setError(result.error);
        if (result.paywall) {
          const next = await getVideoJoinStatus({ data: roomId }).catch(() => null);
          if (next) setStatus(next);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("videoTourFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="w-full px-4 py-10 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        <Link to="/inbox" className="text-sm text-muted">
          ← {t("inbox")}
        </Link>
        {nativeShell ? null : (
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("videoTourKicker")}</p>
        )}
        <h1 className="mt-2 font-display text-3xl">{t("videoTourTitle")}</h1>
        <p className="mt-3 text-sm text-muted">{nativeShell ? t("videoJoinHint") : t("videoTourLead")}</p>
        <p className="mt-2 text-xs text-subtle" data-ke="media-permission-note">{t("mediaPermissionNote")}</p>
        <p className="mt-1 text-xs text-subtle">{t("videoNoRecording")}</p>
        <p className="mt-1 text-xs text-subtle">{t("videoMinutesNote")}</p>

        <div className="ke-call-stage mt-6" data-ke="call-stage">
        <div className="min-w-0">
        {nativeShell && paywall && !canMint ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="native-video-entitlement">
            <p className="text-sm text-muted">{t("nativeVideoNeedsPlus")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox">{t("inbox")}</Link>
            </Button>
          </div>
        ) : null}

        {nativeShell && blockedScaffold && !joined ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="native-video-unavailable">
            <p className="text-sm text-muted">{t("videoNoCredentials")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox">{t("inbox")}</Link>
            </Button>
          </div>
        ) : null}

        {!nativeShell && blockedScaffold && !joined ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="store-coming-soon">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("comingSoon")}</p>
            <p className="mt-2 font-medium">
              {featureOff
                ? t("videoFeatureOffTitle")
                : sdkOff
                  ? t("videoSdkOffTitle")
                  : t("videoNoCredentialsTitle")}
            </p>
            <p className="mt-2 text-sm text-muted">
              {featureOff ? t("videoFeatureOff") : sdkOff ? t("videoSdkOff") : t("videoNoCredentials")}
            </p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox">{t("inbox")}</Link>
            </Button>
          </div>
        ) : null}

        {!nativeShell && status?.error && !paywall && !blockedScaffold && !joined ? (
          <p className="mt-4 text-sm text-danger">{status.error}</p>
        ) : null}
        {error && !blockedScaffold ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        {!nativeShell && paywall ? (
          <div className="ke-digital-plan mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="parent-plus-prompt">
            <p className="font-medium">{t("parentPlusTitle")}</p>
            <p className="mt-2 text-sm text-muted">
              {status?.reason === "plus_required_billing_not_live" ? t("videoPlusRequiredBilling") : t("videoPlusRequired")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <PayCtas>
              <Button asChild>
                <Link to="/parent" search={{ tab: "subscription" }}>
                  {t("parentPlusSubscribe")}
                </Link>
              </Button>
              </PayCtas>
              <Button variant="secondary" asChild>
                <Link to="/inbox">{t("inbox")}</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {canMint && !joined ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="video-join">
            <p className="text-sm text-muted">{t("videoJoinHint")}</p>
            <Button className="mt-4" disabled={busy} onClick={() => void onJoin()}>
              {busy ? t("loading") : t("videoJoin")}
            </Button>
          </div>
        ) : null}

        {!status && !statusFailed && user ? <p className="mt-6 text-sm text-muted">{t("loading")}</p> : null}
        {statusFailed && !joined ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="text-sm text-muted">{t("videoTourFailed")}</p>
            <Button variant="secondary" asChild className="mt-4">
              <Link to="/inbox">{t("inbox")}</Link>
            </Button>
          </div>
        ) : null}
        </div>
        <div className="hidden min-w-0 rounded-2xl bg-surface p-6 ring-1 ring-border md:block">
          <p className="text-sm text-muted">{t("videoJoinHint")}</p>
        </div>
        </div>

        {joined ? (
          <VideoRoomPanel token={joined.token} roomName={joined.roomName} onLeft={() => setJoined(null)} />
        ) : null}
      </main>
    </Shell>
  );
}
