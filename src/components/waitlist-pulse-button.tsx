import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getWaitlistPulseStatus, pulseWaitlistSpot } from "@/lib/server/waitlist-api";
import { useCopy } from "@/lib/use-copy";
import type { WaitlistPulseStatus } from "@/lib/waitlist-pulse";

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
  const [status, setStatus] = useState<WaitlistPulseStatus | null>(null);
  const [busy, setBusy] = useState(false);

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

  function pulse() {
    setBusy(true);
    void pulseWaitlistSpot({ data: { daycareId } })
      .then(() => {
        toast.success(t("waitlistPulseSent"));
        setStatus((cur) => ({
          lastPulsedAt: new Date().toISOString(),
          cooldownUntil: null,
          canPulse: false,
          interestCount: cur?.interestCount ?? 0,
        }));
        return onPulsed?.();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t("waitlistPulseRateLimited")))
      .finally(() => setBusy(false));
  }

  const disabled = busy || status?.canPulse === false;

  return (
    <div className={compact ? "" : "mt-3"}>
      <Button type="button" size={compact ? "sm" : "md"} variant="secondary" disabled={disabled} onClick={pulse}>
        {t("waitlistPulseNotify")}
      </Button>
      {compact ? null : status ? (
        <p className="mt-2 text-xs text-subtle">
          {status.canPulse
            ? `${status.interestCount} · ${t("waitlistPulseLead")}`
            : t("waitlistPulseRateLimited")}
        </p>
      ) : (
        <p className="mt-2 text-xs text-subtle">{t("waitlistPulseLead")}</p>
      )}
    </div>
  );
}
