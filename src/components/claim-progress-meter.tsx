import { useEffect, useRef } from "react";
import { claimProgress, type ClaimProgressInput, type ClaimProgressStepId } from "@/lib/claim-progress";
import { capturePostHogEvent } from "@/lib/posthog";
import { SIGNUP_FUNNEL_EVENT, signupFunnelPayload } from "@/lib/signup-funnel";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const LABEL: Record<ClaimProgressStepId, CopyKey> = {
  photos: "claimProgressPhotos",
  fees: "claimProgressFees",
  ages: "claimProgressAges",
  spots: "claimProgressSpots",
};

/** Four facts parents look for. Shown on the daycare desk after a claim. */
export function ClaimProgressMeter({ item }: { item: ClaimProgressInput }) {
  const { t } = useCopy();
  const progress = claimProgress(item);
  const seen = useRef(false);

  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload("claim_progress_view", { source: "desk" }));
  }, []);

  return (
    <section className="mt-4" data-ke="claim-progress" aria-labelledby="claim-progress-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="claim-progress-title" className="text-sm font-semibold">
          {t("claimProgressTitle")}
        </h3>
        <p className="text-sm tabular-nums text-muted">
          {progress.done}/{progress.total}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">{t("claimProgressLead")}</p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-label={t("claimProgressTitle")}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(progress.done / progress.total) * 100}%` }}
        />
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {progress.steps.map((step) => (
          <li key={step.id} className="flex min-h-11 items-center gap-2 text-sm">
            <span
              className={step.done ? "text-primary" : "text-subtle"}
              aria-hidden
            >
              {step.done ? "✓" : "○"}
            </span>
            <span className={step.done ? "text-fg" : "text-muted"}>{t(LABEL[step.id])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
