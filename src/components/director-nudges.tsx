import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { collectDirectorNudges, type DirectorNudge } from "@/lib/director-nudges";
import { refreshVacancy } from "@/lib/server/claims";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { DemandSnapshot } from "@/lib/demand-heat";
import type { Daycare } from "@/lib/types";
import { useState } from "react";

const KIND_KEY: Record<DirectorNudge["kind"], CopyKey> = {
  vacancy_missing: "nudgeVacancyMissing",
  vacancy_stale: "nudgeVacancyStale",
  fill_risk: "nudgeFillRisk",
  reply_slow: "nudgeReplySlow",
  tours_waiting: "nudgeToursWaiting",
  threads_waiting: "nudgeThreadsWaiting",
  photo_stale: "nudgePhotoStale",
  photo_missing: "nudgePhotoMissing",
};

const CTA_KEY: Record<DirectorNudge["cta"], CopyKey> = {
  confirm_spots: "vacancyRefresh",
  inbox: "openChat",
  requests: "pendingTours",
  edit_photo: "listingHealthEdit",
};

function nudgeText(nudge: DirectorNudge, t: (key: CopyKey) => string) {
  const base = t(KIND_KEY[nudge.kind]);
  return nudge.count != null ? base.replace("{n}", String(nudge.count)) : base;
}

export function DirectorNudgeQueue({
  listings,
  stats,
  onConfirmed,
}: {
  listings: Daycare[];
  stats: Array<{ daycareId: string; demand?: DemandSnapshot | null }>;
  onConfirmed: () => void | Promise<void>;
}) {
  const { t } = useCopy();
  const [busyId, setBusyId] = useState<string | null>(null);
  const nudges = collectDirectorNudges(listings, stats).slice(0, 8);
  if (!nudges.length) return null;

  return (
    <section className="mb-8 rounded-xl bg-surface p-5 ring-1 ring-border">
      <h2 className="font-display text-2xl">{t("directorNudgeTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("directorNudgeLead")}</p>
      <ul className="mt-4 space-y-3">
        {nudges.map((nudge) => (
          <li
            key={nudge.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bg px-4 py-3 ring-1 ring-border"
          >
            <div className="min-w-0">
              <p className="font-medium">{nudge.daycareName}</p>
              <p className="mt-0.5 text-sm text-muted">{nudgeText(nudge, t)}</p>
            </div>
            {nudge.cta === "confirm_spots" ? (
              <Button
                type="button"
                size="sm"
                disabled={busyId === nudge.daycareId}
                onClick={() => {
                  setBusyId(nudge.daycareId);
                  void refreshVacancy({ data: { daycareId: nudge.daycareId } })
                    .then(() => {
                      toast.success(t("vacancyRefreshed"));
                      return onConfirmed();
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Error"))
                    .finally(() => setBusyId(null));
                }}
              >
                {t(CTA_KEY[nudge.cta])}
              </Button>
            ) : nudge.cta === "inbox" ? (
              <Button size="sm" variant="secondary" asChild>
                <Link to="/inbox">{t(CTA_KEY[nudge.cta])}</Link>
              </Button>
            ) : nudge.cta === "requests" ? (
              <Button size="sm" variant="secondary" asChild>
                <Link to="/provider" search={{ desk: "requests" }}>
                  {t(CTA_KEY[nudge.cta])}
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="secondary" asChild>
                <Link to="/provider" search={{ desk: "listings" }}>
                  {t(CTA_KEY[nudge.cta])}
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
