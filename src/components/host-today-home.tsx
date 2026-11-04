import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActionRequiredBanner } from "@/components/listing-readiness-coach";
import { Button } from "@/components/ui/button";
import { WaitlistPulseButton } from "@/components/waitlist-pulse-button";
import { confirmAction } from "@/lib/success-confirm";
import { fillCount, hostCopy } from "@/lib/host-listing-copy";
import { refreshVacancy } from "@/lib/server/claims";
import { getWaitlistPulseStatus } from "@/lib/server/waitlist-api";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

/** Today only: action required, one confirm card, waitlist, and a short stats strip. */
export function HostTodayHome({
  listings,
  stats,
  onChanged,
}: {
  listings: Daycare[];
  stats: Array<{ daycareId: string; views: number; inquiries: number; requests: number }>;
  onChanged: () => void;
}) {
  const { t, locale } = useCopy();
  const copy = hostCopy(locale);
  const [centreId, setCentreId] = useState(listings[0]?.id ?? "");
  const centre = listings.find((row) => row.id === centreId) ?? listings[0];
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<number | null>(null);

  const loadedId = centre?.id ?? "";
  useEffect(() => {
    if (!loadedId) return;
    let live = true;
    void getWaitlistPulseStatus({ data: loadedId })
      .then((row) => {
        if (live) setWaiting(row.interestCount);
      })
      .catch(() => {
        if (live) setWaiting(null);
      });
    return () => {
      live = false;
    };
  }, [loadedId]);

  if (!centre) {
    return (
      <section className="rounded-xl bg-surface px-4 py-6 ring-1 ring-border" data-ke="host-today">
        <p className="text-sm text-muted">{copy.emptyListings}</p>
        <Link to="/provider" search={{ desk: "listings" }} className="mt-3 inline-flex min-h-11 items-center font-medium text-primary">
          {copy.addCentre}
        </Link>
      </section>
    );
  }

  const stat = stats.find((row) => row.daycareId === centre.id);
  const spots = centre.spotsInfant + centre.spotsToddler + centre.spotsPreschool;

  return (
    <div className="space-y-3" data-ke="host-today">
      <p className="text-sm text-muted">{copy.todayLead}</p>
      <ActionRequiredBanner listings={listings} />
      <section className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="host-confirm-spots">
        <h2 className="font-display text-xl">{listings.length > 1 ? copy.pickCentre : centre.name}</h2>
        {listings.length > 1 ? (
          <label className="mt-3 block text-sm">
            {copy.pickCentre}
            <select
              className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
              value={centre.id}
              onChange={(event) => setCentreId(event.target.value)}
            >
              {listings.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="mt-2 text-sm tabular-nums">
          {t("spotsInfant")} {centre.spotsInfant} · {t("spotsToddler")} {centre.spotsToddler} · {t("spotsPreschool")} {centre.spotsPreschool}
        </p>
        <p className="mt-1 text-sm text-muted">{fillCount(copy.spotsCount, spots)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void refreshVacancy({ data: { daycareId: centre.id } })
                .then(() => {
                  confirmAction(t, "openingsUpdated");
                  onChanged();
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : t("actionFailed")))
                .finally(() => setBusy(false));
            }}
          >
            {t("vacancyRefresh")}
          </Button>
          <WaitlistPulseButton daycareId={centre.id} compact onPulsed={onChanged} />
        </div>
        <p className="mt-3 text-sm" data-ke="host-waitlist-summary">
          {waiting == null ? "" : waiting > 0 ? fillCount(copy.waitlistSummary, waiting) : copy.waitlistNone}
        </p>
      </section>
      <dl className="grid grid-cols-3 gap-2 text-center text-sm" data-ke="host-stats">
        {[
          [copy.statsViews, stat?.views ?? 0],
          [copy.statsInquiries, stat?.inquiries ?? 0],
          [copy.statsRequests, stat?.requests ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-surface px-2 py-3 ring-1 ring-border">
            <dt className="text-muted">{label}</dt>
            <dd className="font-display text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
