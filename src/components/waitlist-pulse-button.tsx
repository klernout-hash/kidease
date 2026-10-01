import { useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import { Button } from "@/components/ui/button";
import { getWaitlistPulseStatus, pulseWaitlistSpot } from "@/lib/server/waitlist-api";
import { prepareSpotAlert, sendSpotAlert } from "@/lib/server/spot-alerts";
import { AI_FLAGS } from "@/lib/ai/flags";
import { spotAlertEventProps } from "@/lib/ai/spot-alerts";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { capturePostHogEvent } from "@/lib/posthog";
import { useCopy } from "@/lib/use-copy";
import type { WaitlistPulseStatus } from "@/lib/waitlist-pulse";

type Draft = {
  id: string;
  matched: number;
  age: number;
  start: number;
  distance: number;
  body: string;
  empty: boolean;
};

export function WaitlistPulseButton({
  daycareId,
  onPulsed,
  compact = false,
}: {
  daycareId: string;
  onPulsed?: () => void | Promise<void>;
  compact?: boolean;
}) {
  const { t } = useCopy();
  const spotOn = useAiFeatureFlag(AI_FLAGS.spotAlerts);
  const [status, setStatus] = useState<WaitlistPulseStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let live = true;
    void getWaitlistPulseStatus({ data: daycareId })
      .then((row) => {
        if (live) setStatus(row);
      })
      .catch(() => {
        if (live) setStatus(null);
      });
    return () => {
      live = false;
    };
  }, [daycareId]);

  function finishPulse() {
    confirmSuccess({ variant: "toast", title: t("waitlistPulseSent") });
    setStatus((cur) => ({
      lastPulsedAt: new Date().toISOString(),
      cooldownUntil: null,
      canPulse: false,
      interestCount: cur?.interestCount ?? 0,
    }));
    return onPulsed?.();
  }

  function pulse() {
    setBusy(true);
    const run = spotOn
      ? prepareSpotAlert({ data: { daycareId } }).then((res) => {
          if (!res.ok) {
            capturePostHogEvent("spot_alert_fallback", spotAlertEventProps({ daycareId }));
            return pulseWaitlistSpot({ data: { daycareId } }).then(() => finishPulse());
          }
          setDraft(res);
          capturePostHogEvent("spot_alert_drafted", spotAlertEventProps({ daycareId, matched: res.matched }));
        })
      : pulseWaitlistSpot({ data: { daycareId } }).then(() => finishPulse());
    void run
      .catch((err) => {
        if (!spotOn) {
          toast.error(err instanceof Error ? err.message : t("waitlistPulseRateLimited"));
          return;
        }
        capturePostHogEvent("spot_alert_fallback", spotAlertEventProps({ daycareId }));
        return pulseWaitlistSpot({ data: { daycareId } })
          .then(() => finishPulse())
          .catch((fallbackErr) => toast.error(fallbackErr instanceof Error ? fallbackErr.message : t("waitlistPulseRateLimited")));
      })
      .finally(() => setBusy(false));
  }

  function approve() {
    if (!draft || draft.empty) return;
    setBusy(true);
    void sendSpotAlert({ data: { daycareId, draftId: draft.id, body: draft.body } })
      .then((res) => {
        if (!res.ok && res.error === "quiet") {
          capturePostHogEvent("spot_alert_held_quiet", spotAlertEventProps({ daycareId, matched: draft.matched }));
          toast.message(t("spotAlertQuiet"));
          return;
        }
        if (!res.ok) {
          toast.error(t("spotAlertEmpty"));
          return;
        }
        capturePostHogEvent("spot_alert_approved", spotAlertEventProps({ daycareId, matched: draft.matched }));
        confirmSuccess({ variant: "toast", title: t("spotAlertSent") });
        setDraft(null);
        return onPulsed?.();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t("waitlistPulseRateLimited")))
      .finally(() => setBusy(false));
  }

  const disabled = busy || status?.canPulse === false;

  return (
    <div className={compact ? "" : "mt-3"}>
      <Button type="button" size={compact ? "sm" : "md"} variant="secondary" className="min-h-11" disabled={disabled} onClick={pulse}>
        {busy && spotOn ? t("spotAlertWorking") : t("waitlistPulseNotify")}
      </Button>
      {draft ? (
        <div className="mt-3 space-y-2" data-ke="spot-alert-draft">
          <p className="text-sm">{t("spotAlertLead")}</p>
          {draft.empty ? (
            <p className="text-sm" role="status">{t("spotAlertEmpty")}</p>
          ) : (
            <>
              <p className="text-sm font-medium">{t("spotAlertFit").replace("{n}", String(draft.matched))}</p>
              <p className="text-sm text-muted">
                {t("spotAlertFitDetail")
                  .replace("{age}", String(draft.age))
                  .replace("{start}", String(draft.start))
                  .replace("{distance}", String(draft.distance))}
              </p>
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                aria-label={t("spotAlertApprove")}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
              <Button type="button" className="min-h-11" disabled={busy} onClick={approve}>
                {t("spotAlertApprove")}
              </Button>
            </>
          )}
        </div>
      ) : null}
      {compact || draft ? null : status ? (
        <p className="mt-2 text-xs text-subtle">
          {status.canPulse
            ? `${status.interestCount} · ${t("waitlistPulseLead")}`
            : t("waitlistPulseRateLimited")}
        </p>
      ) : compact || draft ? null : (
        <p className="mt-2 text-xs text-subtle">{t("waitlistPulseLead")}</p>
      )}
    </div>
  );
}
