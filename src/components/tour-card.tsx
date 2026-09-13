import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelTourRequest, proposeTourTime, respondTourRequest, advanceTourRequest } from "@/lib/server/tours";
import { listCentreTourWindows } from "@/lib/server/tour-calendar";
import { formatPreferredTimes } from "@/lib/threads";
import { PipelineBadge } from "@/components/pipeline-badge";
import { useCopy } from "@/lib/use-copy";
import { canCancelTour, canProposeTourTime, declineReasonValid } from "@/lib/tour-hold";
import { formatTourSlotRange, type PublicTourSlot } from "@/lib/tour-calendar";
import type { TourRequest, TourStatus } from "@/lib/types";

export function TourStatusPill({ status }: { status: TourStatus }) {
  return <PipelineBadge tourStatus={status} />;
}

export function TourCard({
  tour,
  canRespond,
  onChanged,
}: {
  tour: TourRequest;
  canRespond?: boolean;
  onChanged?: () => void;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [slots, setSlots] = useState<PublicTourSlot[]>([]);
  const [windowId, setWindowId] = useState("");
  const [proposeOpen, setProposeOpen] = useState(false);

  const showPropose = Boolean(canRespond && canProposeTourTime(tour.status));

  useEffect(() => {
    if (!showPropose) return;
    let live = true;
    void listCentreTourWindows({ data: { daycareId: tour.daycareId } })
      .then((res) => {
        if (!live) return;
        setSlots(res.slots.filter((slot) => slot.id !== tour.windowId && slot.remaining > 0 && slot.inventory !== "blocked"));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [showPropose, tour.daycareId, tour.windowId]);

  async function respond(status: "accepted" | "declined") {
    if (status === "declined" && !declineReasonValid(note)) {
      toast.error(t("tourDeclineNeedReason"));
      return;
    }
    setBusy(status);
    try {
      await respondTourRequest({ data: { tourId: tour.id, status, note: note.trim() || undefined } });
      toast.success(status === "accepted" ? t("pipelineConfirmed") : t("pipelineLost"));
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function advance(status: "completed" | "enrolled" | "lost") {
    setBusy(status);
    try {
      await advanceTourRequest({ data: { tourId: tour.id, status, note: note.trim() || undefined } });
      toast.success(
        status === "completed" ? t("pipelineCompleted") : status === "enrolled" ? t("pipelineEnrolled") : t("pipelineLost"),
      );
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function propose() {
    if (!windowId) {
      toast.error(t("tourProposeNeedSlot"));
      return;
    }
    setBusy("propose");
    try {
      await proposeTourTime({ data: { tourId: tour.id, windowId, note: note.trim() || undefined } });
      toast.success(t("tourProposed"));
      setProposeOpen(false);
      setWindowId("");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      await cancelTourRequest({ data: { tourId: tour.id, note: note.trim() || undefined } });
      toast.success(t("tourCancelled"));
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-border" id={`tour-${tour.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">
            {tour.status === "pending" ? t("tourSoftHold") : t("tourRequest")}
          </p>
          <p className="mt-1 font-medium">
            {tour.parentName ? `${tour.parentName}` : t("parentLabel")}
            {tour.childName ? ` · ${tour.childName}` : ""}
          </p>
          <p className="mt-1 text-sm text-muted">
            {tour.daycareName} · {formatPreferredTimes(tour.preferredTimes, locale)}
          </p>
        </div>
        <TourStatusPill status={tour.status} />
      </div>
      {tour.parentNote ? <p className="mt-2 text-sm text-muted">{tour.parentNote}</p> : null}
      {tour.centreNote ? (
        <p className="mt-2 text-sm text-muted">
          {t("tourCentreNote")}: {tour.centreNote}
        </p>
      ) : null}
      {canRespond && (tour.status === "pending" || tour.status === "accepted" || tour.status === "completed") ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={2}
            placeholder={tour.status === "pending" ? t("tourDeclineReason") : t("tourRespondNote")}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {proposeOpen ? (
            <div className="space-y-2 rounded-md bg-bg p-3 ring-1 ring-border">
              {slots.length === 0 ? (
                <p className="text-sm text-muted">{t("tourTimesNoneOpen")}</p>
              ) : (
                <label className="block text-sm">
                  {t("todayProposeTime")}
                  <select
                    className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3"
                    value={windowId}
                    onChange={(e) => setWindowId(e.target.value)}
                  >
                    <option value="">{t("tourTimesPickSlot")}</option>
                    {slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {formatTourSlotRange(slot, loc)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy !== null || !windowId} onClick={() => void propose()}>
                  {busy === "propose" ? t("loading") : t("todayProposeTime")}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setProposeOpen(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {tour.status === "pending" ? (
              <>
                <Button size="sm" disabled={busy !== null} onClick={() => void respond("accepted")}>
                  {busy === "accepted" ? t("loading") : t("acceptTour")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setProposeOpen(true)}>
                  {t("todayProposeTime")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void respond("declined")}>
                  {busy === "declined" ? t("loading") : t("declineTour")}
                </Button>
              </>
            ) : null}
            {tour.status === "accepted" ? (
              <>
                <Button size="sm" disabled={busy !== null} onClick={() => void advance("completed")}>
                  {busy === "completed" ? t("loading") : t("markTourCompleted")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setProposeOpen(true)}>
                  {t("todayProposeTime")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void cancel()}>
                  {busy === "cancel" ? t("loading") : t("cancelTour")}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void advance("lost")}>
                  {busy === "lost" ? t("loading") : t("markTourLost")}
                </Button>
              </>
            ) : null}
            {tour.status === "completed" ? (
              <>
                <Button size="sm" disabled={busy !== null} onClick={() => void advance("enrolled")}>
                  {busy === "enrolled" ? t("loading") : t("markTourEnrolled")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void advance("lost")}>
                  {busy === "lost" ? t("loading") : t("markTourLost")}
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" asChild>
              <Link to="/inbox/$id" params={{ id: tour.conversationId }} search={{ view: "centre", tour: tour.id }}>
                {t("openChat")}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {!canRespond && tour.status === "accepted" ? (
            <Button size="sm" disabled={busy !== null} onClick={() => void advance("completed")}>
              {busy === "completed" ? t("loading") : t("markTourCompleted")}
            </Button>
          ) : null}
          {!canRespond && canCancelTour(tour.status) ? (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void cancel()}>
              {busy === "cancel" ? t("loading") : t("cancelTour")}
            </Button>
          ) : null}
          {tour.conversationId ? (
            <Button size="sm" variant="secondary" asChild>
              <Link to="/inbox/$id" params={{ id: tour.conversationId }}>
                {t("openChat")}
              </Link>
            </Button>
          ) : null}
          {tour.status === "accepted" && !canRespond ? (
            <Button size="sm" asChild>
              <Link to="/book/$slug" params={{ slug: tour.daycareSlug }}>
                {t("book")}
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
