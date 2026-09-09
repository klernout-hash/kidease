import { useMemo, useState } from "react";
import { DaycareCard } from "@/components/daycare-card";
import { EmptyState } from "@/components/empty-state";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { PipelineBadge } from "@/components/pipeline-badge";
import { ShortlistCompareTable } from "@/components/shortlist-compare";
import { TrustSignals } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { MAX_SHORTLIST_COMPARE, toggleCompareSelection } from "@/lib/shortlist";
import { useAppStore } from "@/lib/store";
import type { Booking, DaycareCard as Card, TourRequest } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

const SAVED_EAGER_CARDS = 4;

export function ParentShortlist({
  items,
  ready,
  located,
  tours,
  bookings,
}: {
  items: Array<Card & { distanceKm: number }>;
  ready: boolean;
  located: boolean;
  tours: TourRequest[];
  bookings: Booking[];
}) {
  const { t } = useCopy();
  const distanceUnit = useAppStore((s) => s.distanceUnit);
  const [picked, setPicked] = useState<string[]>([]);
  const visible = ready ? items : items.slice(0, SAVED_EAGER_CARDS);
  const compared = useMemo(() => items.filter((item) => picked.includes(item.id)).slice(0, MAX_SHORTLIST_COMPARE), [items, picked]);
  const distances = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item.distanceKm])), [items]);

  if (!items.length) {
    return (
      <div className="ke-listings mt-6">
        <EmptyState title={t("noSaved")} body={t("shortlistLead")} action={t("emptyFindCare")} actionTo="/search" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h2 className="font-display text-2xl">{t("myShortlist")}</h2>
        <p className="mt-1 text-sm text-muted">{t("shortlistLead")}</p>
        <p className="mt-2 text-sm text-muted">
          {t("shortlistCompareLead")}{" "}
          {picked.length ? (
            <span className="font-medium text-fg">
              {t("compare")} · {picked.length}/{MAX_SHORTLIST_COMPARE}
            </span>
          ) : null}
        </p>
        {picked.length >= MAX_SHORTLIST_COMPARE ? <p className="mt-1 text-xs text-subtle">{t("shortlistCompareMax")}</p> : null}
        {picked.length === 1 ? <p className="mt-1 text-xs text-subtle">{t("shortlistNeedTwo")}</p> : null}
        {picked.length ? (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setPicked([])}>
            {t("clearCompare")}
          </Button>
        ) : null}
      </div>

      <ShortlistCompareTable
        items={compared}
        distancesKm={distances}
        distanceUnit={distanceUnit}
        located={located}
        onRemove={(id) => setPicked((cur) => cur.filter((x) => x !== id))}
      />

      <div className="ke-listings">
        {visible.map((item) => {
          const on = picked.includes(item.id);
          const atCap = !on && picked.length >= MAX_SHORTLIST_COMPARE;
          return (
            <div key={item.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={on}
                    disabled={atCap}
                    onChange={() => setPicked((cur) => toggleCompareSelection(cur, item.id))}
                  />
                  <span>{t("addToCompare")}</span>
                </label>
                {item.live || (item.claimStatus && item.claimStatus !== "unclaimed") ? (
                  <ListingStatusBadge claimStatus={item.claimStatus} live={item.live} />
                ) : null}
                <PipelineBadge
                  tourStatus={tours.find((tour) => tour.daycareId === item.id)?.status}
                  bookingStatus={bookings.find((b) => b.daycareId === item.id)?.status ?? null}
                />
                <TrustSignals item={item} surface="parent" compact />
              </div>
              <DaycareCard item={item} showDistance={located} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
