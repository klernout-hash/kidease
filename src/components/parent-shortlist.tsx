import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DaycareCard } from "@/components/daycare-card";
import { EmptyState } from "@/components/empty-state";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { PipelineBadge } from "@/components/pipeline-badge";
import { ShortlistCompareTable } from "@/components/shortlist-compare";
import { TrustSignals } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { MultiApplyPanel } from "@/components/multi-apply-sheet";
import { mirrorOfflineSaved, readOfflineSaved, type OfflineSaved } from "@/lib/offline-shortlist";
import { MAX_SHORTLIST_COMPARE, toggleCompareSelection } from "@/lib/shortlist";
import type { Booking, DaycareCard as Card, TourRequest } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

const SAVED_EAGER_CARDS = 4;

export function ParentShortlist({
  items,
  ready,
  located,
  tours,
  bookings,
  compareMax = MAX_SHORTLIST_COMPARE,
}: {
  items: Array<Card & { distanceKm: number }>;
  ready: boolean;
  located: boolean;
  tours: TourRequest[];
  bookings: Booking[];
  /** Free is 5. Parent Plus is 10. */
  compareMax?: number;
}) {
  const { t, locale } = useCopy();
  const [picked, setPicked] = useState<string[]>([]);
  const [offline, setOffline] = useState<OfflineSaved[]>([]);
  const visible = ready ? items : items.slice(0, SAVED_EAGER_CARDS);
  const compared = useMemo(() => items.filter((item) => picked.includes(item.id)).slice(0, compareMax), [compareMax, items, picked]);
  const distances = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item.distanceKm])), [items]);

  useEffect(() => {
    if (items.length) {
      void mirrorOfflineSaved(items.map((item) => ({ id: item.id, name: item.name, city: item.city, slug: item.slug })));
      return;
    }
    void readOfflineSaved().then(setOffline).catch(() => undefined);
  }, [items]);

  if (!items.length && offline.length) {
    const note =
      locale === "fr"
        ? "Enregistré sur ce téléphone. Reconnectez-vous pour actualiser."
        : "Saved on this phone. Connect again to refresh.";
    return (
      <div className="mt-6 w-full">
        <h2 className="font-display text-2xl">{t("myShortlist")}</h2>
        <ul className="mt-4 w-full space-y-2">
          {offline.map((row) => (
            <li key={row.id}>
              <Link to="/daycare/$slug" params={{ slug: row.slug }} className="block min-h-11 rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
                <span className="block font-medium text-fg">{row.name}</span>
                {row.city ? <span className="block text-sm text-muted">{row.city}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">{note}</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mt-6 w-full">
        <h2 className="font-display text-2xl">{t("myShortlist")}</h2>
        <div className="mt-4 w-full">
          <EmptyState title={t("noSaved")} body={t("shortlistLead")} action={t("emptyFindCare")} actionTo="/search" />
        </div>
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
              {t("compare")} · {picked.length}/{compareMax}
            </span>
          ) : null}
        </p>
        {picked.length >= compareMax ? <p className="mt-1 text-xs text-subtle">{t("shortlistCompareMax")}</p> : null}
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
        located={located}
        onRemove={(id) => setPicked((cur) => cur.filter((x) => x !== id))}
      />

      <MultiApplyPanel centres={visible} returnTo="/parent?tab=saved" />

      <div className="ke-listings ke-listings-narrow">
        {visible.map((item) => {
          const on = picked.includes(item.id);
          const atCap = !on && picked.length >= compareMax;
          return (
            <div key={item.id} className="min-w-0 space-y-2">
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-hidden">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={on}
                    disabled={atCap}
                    onChange={() => setPicked((cur) => toggleCompareSelection(cur, item.id, compareMax))}
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
              <DaycareCard item={item} showDistance={located} presentation="visual" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
