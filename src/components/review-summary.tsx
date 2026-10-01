import { useEffect, useState } from "react";
import { AI_FLAGS } from "@/lib/ai/flags";
import { reviewSummaryEventProps } from "@/lib/ai/review-summary";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { capturePostHogEvent } from "@/lib/posthog";
import { summarizeListingReviews } from "@/lib/server/review-summary";
import { useCopy } from "@/lib/use-copy";

export function ReviewSummary({ daycareId }: { daycareId: string }) {
  const on = useAiFeatureFlag(AI_FLAGS.reviewSummary);
  const { t } = useCopy();
  const [points, setPoints] = useState<string[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!on || !daycareId) return;
    let live = true;
    void summarizeListingReviews({ data: { daycareId } })
      .then((res) => {
        if (!live) return;
        if (!res.ok || res.points.length === 0) {
          if (!res.ok || res.source === "fallback") {
            capturePostHogEvent("review_summary_fallback", reviewSummaryEventProps({ daycareId }));
          }
          setPoints([]);
          return;
        }
        setPoints(res.points);
        setCount(res.count);
        capturePostHogEvent("review_summary_shown", reviewSummaryEventProps({ daycareId, count: res.count }));
      })
      .catch(() => {
        if (!live) return;
        setPoints([]);
        capturePostHogEvent("review_summary_fallback", reviewSummaryEventProps({ daycareId }));
      });
    return () => {
      live = false;
    };
  }, [on, daycareId]);

  if (!on || points.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg bg-surface p-3 ring-1 ring-border" data-ke="review-summary">
      <h3 className="text-sm font-semibold">{t("reviewSummaryTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t("reviewSummaryLead").replace("{count}", String(count))}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <a href="#listing-reviews" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {t("reviewSummaryLink")}
      </a>
    </div>
  );
}
