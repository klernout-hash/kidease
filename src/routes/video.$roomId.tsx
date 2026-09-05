import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { VIDEO_SDK_SCAFFOLD_MESSAGE } from "@/lib/video";
import {
  getVideoJoinStatus,
  joinVideoRoom,
  type VideoJoinResult,
  type VideoJoinStatus,
} from "@/lib/server/video-join";

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
  const [status, setStatus] = useState<VideoJoinStatus | null>(null);
  const [joined, setJoined] = useState<Extract<VideoJoinResult, { ok: true }> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setJoined(null);
    setError("");
    void getVideoJoinStatus({ data: roomId })
      .then(setStatus)
      .catch(() => setStatus(null));
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
  const canMint = Boolean(status?.gateOk);

  async function onJoin() {
    setBusy(true);
    setError("");
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
      <main className="mx-auto max-w-lg px-4 py-10">
        <Link to="/inbox" className="text-sm text-muted">
          ← {t("inbox")}
        </Link>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("videoTourKicker")}</p>
        <h1 className="mt-2 font-display text-3xl">{t("videoTourTitle")}</h1>
        <p className="mt-3 text-sm text-muted">{t("videoTourLead")}</p>
        <p className="mt-2 text-xs text-subtle">{t("videoNoRecording")}</p>
        <p className="mt-1 text-xs text-subtle">{t("videoMinutesNote")}</p>

        {status?.error && !paywall && !joined ? <p className="mt-4 text-sm text-danger">{status.error}</p> : null}
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        {paywall ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="font-medium">{t("parentPlusTitle")}</p>
            <p className="mt-2 text-sm text-muted">
              {status?.reason === "plus_required_billing_not_live" ? t("videoPlusRequiredBilling") : t("videoPlusRequired")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/parent" search={{ tab: "payments" }}>
                  {t("parentPlusSubscribe")}
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/inbox">{t("inbox")}</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {canMint && !joined ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="text-sm text-muted">{t("videoJoinHint")}</p>
            <Button className="mt-4" disabled={busy} onClick={() => void onJoin()}>
              {busy ? t("loading") : t("videoJoin")}
            </Button>
          </div>
        ) : null}

        {joined ? (
          <div className="mt-6 rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
            <p className="font-medium">{t("videoRoomReady")}</p>
            <p className="mt-2 text-sm text-muted">{VIDEO_SDK_SCAFFOLD_MESSAGE}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">{t("videoRoom")}</dt>
                <dd className="font-mono text-xs">{joined.roomName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">{t("videoTokenTtl")}</dt>
                <dd>{joined.ttlSeconds}s</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-subtle">{joined.minutesMessage}</p>
          </div>
        ) : null}

        {!status && user ? <p className="mt-6 text-sm text-muted">{t("loading")}</p> : null}
      </main>
    </Shell>
  );
}
