import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { DaycareCard } from "@/components/daycare-card";
import { EmptyState } from "@/components/empty-state";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { PipelineBadge } from "@/components/pipeline-badge";
import { SavedTrack } from "@/components/saved-track";
import { ShortlistCompareTable } from "@/components/shortlist-compare";
import { TrustSignals } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { MultiApplyPanel } from "@/components/multi-apply-sheet";
import { mirrorOfflineSaved, readOfflineSaved, type OfflineSaved } from "@/lib/offline-shortlist";
import { parseTrackStatus, type TrackStatus } from "@/lib/parent-tracker";
import { inviteShortlistShare, leaveShortlistShare } from "@/lib/server/parent-tracker";
import { MAX_SHORTLIST_COMPARE, toggleCompareSelection } from "@/lib/shortlist";
import { useAppStore } from "@/lib/store";
import type { Booking, DaycareCard as Card, TourRequest } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { useParentPlusAccess } from "@/lib/use-parent-plus";

const MapView = lazy(() => import("@/components/map-view").then((m) => ({ default: m.MapView })));

const SAVED_EAGER_CARDS = 4;

export function ParentShortlist({
  items,
  ready,
  located,
  tours,
  bookings,
  compareMax = MAX_SHORTLIST_COMPARE,
  shared = false,
  onTrack,
  onLeave,
}: {
  items: Array<Card & { distanceKm: number }>;
  ready: boolean;
  located: boolean;
  tours: TourRequest[];
  bookings: Booking[];
  /** Free is 5. Parent Plus is 10. */
  compareMax?: number;
  shared?: boolean;
  onTrack?: (id: string, next: { trackStatus: TrackStatus; callNote: string; tourNote: string }) => void;
  onLeave?: () => void;
}) {
  const { t, locale } = useCopy();
  const { plusOpen } = useParentPlusAccess();
  const leadKey = plusOpen ? "shortlistLeadOpen" : "shortlistLead";
  const origin = useAppStore((s) => s.origin);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const [picked, setPicked] = useState<string[]>([]);
  const [offline, setOffline] = useState<OfflineSaved[]>([]);
  const [mapOn, setMapOn] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [heldPath, setHeldPath] = useState("");
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
        <h2 className="font-display text-2xl">{t("saved")}</h2>
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
        <h2 className="font-display text-2xl">{t("saved")}</h2>
        <div className="mt-4 w-full">
          <EmptyState title={t("noSaved")} body={t(leadKey)} action={t("emptyFindCare")} actionTo="/search" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">{t("saved")}</h2>
          <Button
            type="button"
            variant="secondary"
            aria-pressed={mapOn}
            data-ke="saved-map-toggle"
            onClick={() => setMapOn((on) => !on)}
          >
            {mapOn ? t("savedList") : t("savedMap")}
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted">{t(leadKey)}</p>
        {shared ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-fg" data-ke="shortlist-shared">
              {t("shareShortlistShared")}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void leaveShortlistShare()
                  .then(() => onLeave?.())
                  .catch(() => toast.error(t("trackSaveFailed")));
              }}
            >
              {t("shareShortlistLeave")}
            </Button>
          </div>
        ) : (
          <form
            className="mt-3 w-full space-y-2"
            data-ke="shortlist-share"
            onSubmit={(event) => {
              event.preventDefault();
              setInviteError("");
              setHeldPath("");
              setInviteBusy(true);
              void inviteShortlistShare({ data: { email: inviteEmail } })
                .then((result) => {
                  if (!result.ok) {
                    const key =
                      result.reason === "self"
                        ? "shareShortlistSelf"
                        : result.reason === "limit"
                          ? "shareShortlistLimit"
                          : "shareShortlistEmailBad";
                    setInviteError(t(key));
                    return;
                  }
                  setInviteEmail("");
                  if (result.emailed) {
                    toast.success(t("shareShortlistSent"));
                    return;
                  }
                  setHeldPath(result.path);
                  toast.message(t("shareShortlistHeld"));
                })
                .catch(() => setInviteError(t("shareShortlistBad")))
                .finally(() => setInviteBusy(false));
            }}
          >
            <p className="text-sm font-medium text-fg">{t("shareShortlist")}</p>
            <label className="block text-sm" htmlFor="shortlist-partner-email">
              {t("shareShortlistEmail")}
            </label>
            <p className="text-sm text-muted">{t("shareShortlistLead")}</p>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="shortlist-partner-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
                className="h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-base"
              />
              <Button type="submit" variant="secondary" disabled={inviteBusy}>
                {t("shareShortlistSend")}
              </Button>
            </div>
            {inviteError ? (
              <p role="alert" className="text-sm text-danger">
                {inviteError}
              </p>
            ) : null}
            {heldPath ? (
              <p className="break-all text-sm text-fg" data-ke="share-link">
                {heldPath}
              </p>
            ) : null}
          </form>
        )}
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

      {mapOn ? (
        <div className="h-[min(72dvh,36rem)] min-h-[18rem] overflow-hidden rounded-[14px] shadow-card ring-1 ring-border">
          <Suspense fallback={<div className="ke-skel size-full" aria-hidden="true" />}>
            <MapView
              items={visible}
              origin={
                located && Number.isFinite(origin.lat)
                  ? { lat: origin.lat, lng: origin.lng }
                  : { lat: visible[0]?.lat ?? origin.lat, lng: visible[0]?.lng ?? origin.lng }
              }
              radiusKm={radiusKm}
              onSelect={() => undefined}
              onFallback={() => setMapOn(false)}
            />
          </Suspense>
        </div>
      ) : (
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
              <SavedTrack
                daycareId={item.id}
                status={parseTrackStatus(item.trackStatus)}
                callNote={item.callNote ?? ""}
                tourNote={item.tourNote ?? ""}
                onChange={(next) => onTrack?.(item.id, next)}
              />
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
